import { FastifyReply, FastifyRequest } from "fastify";
// ssh2 is CommonJS and Node's ESM interop does not expose `utils` as a named export,
// unlike `Client` — so it has to come off the default export.
import ssh2 from "ssh2";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { TunnelService } from "../services/TunnelService.js";

interface TunnelUpdateBody {
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
    privateKey?: string;
    passphrase?: string | null;
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
     * Updates the SSH credentials. Neither the connection mode nor the tunnel target nor
     * the bind port are editable: the mode is fixed at creation time, the target follows
     * from each job's repository and the port is allocated per forward.
     */
    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const body = (request.body ?? {}) as TunnelUpdateBody;

        const client = ClientRepository.findById(clientId);
        if (!client) {
            return reply.code(404).send({ error: "Client not found" });
        }
        if (client.connection_mode !== "outbound") {
            return reply.code(400).send({
                error: "Only outbound clients have an SSH tunnel",
            });
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

        // New credentials must not be used by an existing connection.
        TunnelService.closeClient(clientId);
        return { status: "updated" };
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
