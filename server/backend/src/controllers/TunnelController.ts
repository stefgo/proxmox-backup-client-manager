import { FastifyReply, FastifyRequest } from "fastify";
// ssh2 is CommonJS and Node's ESM interop does not expose `utils` as a named export,
// unlike `Client` — so it has to come off the default export.
import ssh2 from "ssh2";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { TunnelService } from "../services/TunnelService.js";
import { ProxyService } from "../services/ProxyService.js";

interface TunnelUpdateBody {
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
    privateKey?: string;
    passphrase?: string | null;
    hostKeySha256?: string;
}

interface TunnelCreateBody {
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
    privateKey?: string;
    passphrase?: string;
    hostKeySha256?: string;
}

interface KeyPairBody {
    comment?: string;
}

interface PublicKeyBody {
    privateKey?: string;
    passphrase?: string;
}

/** The subset of `TunnelTestBody` a stored-credentials test may override. */
interface TunnelTestOverrideBody {
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
}

interface TunnelTestBody {
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
    privateKey?: string;
    passphrase?: string;
    expectedHostKeySha256?: string;
}

export class TunnelController {
    /** Tunnel configuration without any secret — the key is write-only by design. */
    static async get(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const row = ClientTunnelRepository.findByClientId(clientId);

        if (!row) {
            return reply
                .code(404)
                .send({ error: "No SSH tunnel is configured for this client" });
        }

        return {
            clientId: row.client_id,
            sshHost: row.ssh_host,
            sshPort: row.ssh_port,
            sshUser: row.ssh_user,
            hasPrivateKey: !!row.private_key,
            hasPassphrase: !!row.passphrase,
            hostKeySha256: row.host_key_sha256,
            remoteBindHost: row.remote_bind_host,
            state: TunnelService.getStatus(clientId),
        };
    }

    /**
     * Attaches a tunnel to an existing client — the only way an inbound client gets one,
     * since it does not exist as a row until its agent has registered itself.
     *
     * Unlike the outbound create flow in `ClientController`, nothing here is atomic with
     * a registration: the client already exists, so a failed test costs nothing but the
     * error message. The test still runs first, so a tunnel is never stored in a state
     * that was never seen to work.
     */
    static async create(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = (request.body ?? {}) as TunnelCreateBody;

        if (!ClientRepository.findById(clientId)) {
            return reply.code(404).send({ error: "Client not found" });
        }
        if (ClientTunnelRepository.findByClientId(clientId)) {
            return reply.code(409).send({
                error: "This client already has an SSH tunnel — edit it instead",
            });
        }
        if (
            !body.sshHost ||
            !body.sshUser ||
            !body.privateKey ||
            !body.hostKeySha256
        ) {
            return reply.code(400).send({
                error: "Incomplete SSH credentials (sshHost, sshUser, privateKey, hostKeySha256)",
            });
        }

        const test = await TunnelService.testConnection({
            sshHost: body.sshHost,
            sshPort: body.sshPort,
            sshUser: body.sshUser,
            privateKey: body.privateKey,
            passphrase: body.passphrase,
            expectedHostKeySha256: body.hostKeySha256,
        });
        if (!test.ok) {
            return reply
                .code(400)
                .send({ error: `SSH tunnel test failed: ${test.error}` });
        }

        ClientTunnelRepository.create(clientId, {
            sshHost: body.sshHost,
            sshPort: body.sshPort,
            sshUser: body.sshUser,
            privateKey: body.privateKey,
            passphrase: body.passphrase,
            hostKeySha256: body.hostKeySha256,
        });

        // Stored means available, not in use: the jobs that are to take this route have
        // to ask for it themselves, one by one, in the job editor.
        ProxyService.broadcastClientUpdate();
        return { status: "created" };
    }

    /**
     * Updates the SSH credentials. Neither the connection mode nor the tunnel target nor
     * the bind port are editable: the mode is fixed at creation time, the target follows
     * from each job's repository and the port is allocated per forward. Whether the
     * tunnel is used is not here either — that is each job's own setting.
     */
    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = (request.body ?? {}) as TunnelUpdateBody;

        if (!ClientRepository.findById(clientId)) {
            return reply.code(404).send({ error: "Client not found" });
        }
        if (!ClientTunnelRepository.findByClientId(clientId)) {
            return reply
                .code(404)
                .send({ error: "No SSH tunnel is configured for this client" });
        }

        const info = ClientTunnelRepository.update(clientId, body);
        if (info.changes === 0) {
            return reply.code(400).send({ error: "No changes submitted" });
        }

        // New credentials must not be used by an existing connection. A run holding a
        // lease at this moment fails, which is the honest outcome: its remaining bytes
        // would go through a connection nobody has checked.
        TunnelService.closeClient(clientId);
        return { status: "updated" };
    }

    /**
     * Removes the tunnel entirely, credentials included. The client stays. Its jobs keep
     * their own `tunnel` setting, and any that asks for the route now fails at the lease
     * — deliberately loud: silently rerouting a backup past a tunnel it was configured
     * for would send it out over a path the operator never chose.
     */
    static async remove(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };

        const info = ClientTunnelRepository.delete(clientId);
        if (info.changes === 0) {
            return reply
                .code(404)
                .send({ error: "No SSH tunnel is configured for this client" });
        }

        TunnelService.closeClient(clientId);
        ProxyService.broadcastClientUpdate();
        return { status: "deleted" };
    }

    /**
     * Tests SSH reachability and whether a reverse forward is permitted, using parameters
     * from the request. For the create wizard, where nothing is stored yet. Returns the
     * host key fingerprint for the operator to confirm.
     */
    static async test(request: FastifyRequest, reply: FastifyReply) {
        const body = (request.body ?? {}) as TunnelTestBody;

        if (!body.sshHost || !body.sshUser || !body.privateKey) {
            return reply.code(400).send({
                error: "sshHost, sshUser and privateKey are required",
            });
        }

        const result = await TunnelService.testConnection({
            sshHost: body.sshHost,
            sshPort: body.sshPort,
            sshUser: body.sshUser,
            privateKey: body.privateKey,
            passphrase: body.passphrase,
            expectedHostKeySha256: body.expectedHostKeySha256,
        });
        return result;
    }

    /**
     * Creates a fresh ed25519 key pair for the setup helper in the UI. Nothing is stored
     * here — the key is persisted only by the regular create/update calls. This is the one
     * moment a private key travels to the browser; it is write-only everywhere else.
     */
    static async generateKeyPair(request: FastifyRequest, reply: FastifyReply) {
        const body = (request.body ?? {}) as KeyPairBody;
        const comment = (body.comment || "pbcm-server").trim();

        try {
            const pair = ssh2.utils.generateKeyPairSync("ed25519", { comment });
            return {
                type: "ssh-ed25519",
                privateKey: pair.private,
                publicKey: pair.public,
            };
        } catch (e) {
            return reply.code(500).send({
                error: `Could not generate key pair: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            });
        }
    }

    /**
     * Derives the public key from a private key the operator brought along, so the
     * authorized_keys snippet is available for self-supplied keys too.
     */
    static async derivePublicKey(request: FastifyRequest, reply: FastifyReply) {
        const body = (request.body ?? {}) as PublicKeyBody;

        if (!body.privateKey) {
            return reply.code(400).send({ error: "privateKey is required" });
        }

        const parsed = ssh2.utils.parseKey(body.privateKey, body.passphrase);
        if (parsed instanceof Error) {
            return reply.code(400).send({
                error: `Could not read the private key: ${parsed.message}`,
            });
        }

        const key = Array.isArray(parsed) ? parsed[0] : parsed;
        const comment = key.comment ? ` ${key.comment}` : "";
        return {
            type: key.type,
            publicKey: `${key.type} ${key.getPublicSSH().toString("base64")}${comment}`,
        };
    }

    /**
     * Same test against the stored credentials, so the private key never has to leave
     * the backend for a routine check from the client editor.
     *
     * Host, port and user may be overridden from the request: the editor has to be able
     * to test what is on screen rather than what is in the database, or a green result
     * would describe a configuration the operator is about to replace. The key is not
     * overridable — it stays write-only, and an edited key goes through the parameterised
     * `test` above instead.
     */
    static async testStored(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = (request.body ?? {}) as TunnelTestOverrideBody;
        let creds;

        try {
            creds = ClientTunnelRepository.findCredentials(clientId);
        } catch (e) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }

        if (!creds) {
            return reply
                .code(404)
                .send({ error: "No SSH tunnel is configured for this client" });
        }

        return TunnelService.testConnection({
            sshHost: body.sshHost?.trim() || creds.sshHost,
            sshPort: body.sshPort ?? creds.sshPort,
            sshUser: body.sshUser?.trim() || creds.sshUser,
            privateKey: creds.privateKey,
            passphrase: creds.passphrase,
            // Always the stored fingerprint: a host presenting a different key must fail
            // here. `testConnection` still reports the key it saw, which is what lets the
            // editor offer to re-pin it.
            expectedHostKeySha256: creds.hostKeySha256,
            remoteBindHost: creds.remoteBindHost,
        });
    }
}
