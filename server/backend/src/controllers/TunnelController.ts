import { FastifyReply, FastifyRequest } from "fastify";
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
                .send({ error: "Für diesen Client ist kein SSH-Tunnel hinterlegt" });
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
                error: "Nur Outbound-Clients besitzen einen SSH-Tunnel",
            });
        }
        if (!ClientTunnelRepository.findByClientId(clientId)) {
            return reply
                .code(404)
                .send({ error: "Für diesen Client ist kein SSH-Tunnel hinterlegt" });
        }

        const info = ClientTunnelRepository.update(clientId, body);
        if (info.changes === 0) {
            return reply.code(400).send({ error: "Keine Änderungen übergeben" });
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
                error: "sshHost, sshUser und privateKey sind erforderlich",
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
     * Same test against the stored credentials, so the private key never has to leave
     * the backend for a routine check from the client editor.
     */
    static async testStored(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
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
                .send({ error: "Für diesen Client ist kein SSH-Tunnel hinterlegt" });
        }

        return TunnelService.testConnection({
            sshHost: creds.sshHost,
            sshPort: creds.sshPort,
            sshUser: creds.sshUser,
            privateKey: creds.privateKey,
            passphrase: creds.passphrase,
            expectedHostKeySha256: creds.hostKeySha256,
            remoteBindHost: creds.remoteBindHost,
        });
    }
}
