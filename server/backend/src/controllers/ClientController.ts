import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { ProxyService } from "../services/ProxyService.js";
import { WS_EVENTS, ClientSchema, normaliseTargetAddress } from "@pbcm/shared";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientTunnelRepository } from "../repositories/ClientTunnelRepository.js";
import { ClientConnector } from "../services/ClientConnector.js";
import { TunnelService } from "../services/TunnelService.js";
import { logger } from "../core/logger.js";
import db from "../core/Database.js";

interface OutboundBody {
    hostname?: string;
    outboundTargetAddress?: string;
    registrationSecret?: string;
    tunnel?: {
        sshHost?: string;
        sshPort?: number;
        sshUser?: string;
        privateKey?: string;
        passphrase?: string;
        hostKeySha256?: string;
    };
}

export class ClientController {
    /**
     * Creates an outbound client together with its SSH tunnel — deliberately one atomic
     * operation. An outbound client without a working tunnel has no route to the PBS at
     * all, so nothing is persisted unless both the tunnel test and the registration
     * handshake succeed. The connection mode is fixed here and cannot be changed later.
     */
    static async createOutbound(request: FastifyRequest, reply: FastifyReply) {
        const body = (request.body ?? {}) as OutboundBody;
        const { hostname, outboundTargetAddress, registrationSecret } = body;
        const tunnel = body.tunnel;

        if (!outboundTargetAddress || !registrationSecret) {
            return reply.code(400).send({
                error: "outboundTargetAddress and registrationSecret are required",
            });
        }
        if (
            !tunnel?.sshHost ||
            !tunnel?.sshUser ||
            !tunnel?.privateKey ||
            !tunnel?.hostKeySha256
        ) {
            return reply.code(400).send({
                error: "Incomplete SSH credentials (sshHost, sshUser, privateKey, hostKeySha256)",
            });
        }

        // Step 1 — prove the tunnel works and that the host key matches the fingerprint
        // the operator confirmed in the wizard.
        const test = await TunnelService.testConnection({
            sshHost: tunnel.sshHost,
            sshPort: tunnel.sshPort,
            sshUser: tunnel.sshUser,
            privateKey: tunnel.privateKey,
            passphrase: tunnel.passphrase,
            expectedHostKeySha256: tunnel.hostKeySha256,
        });
        if (!test.ok) {
            return reply
                .code(400)
                .send({ error: `SSH tunnel test failed: ${test.error}` });
        }

        // Step 2 — registration and AUTH. Nothing is written before this succeeds.
        const id = randomUUID();
        const resolvedHostname = hostname?.trim() || outboundTargetAddress;
        let persisted = false;

        const result = await ClientConnector.firstConnect(
            id,
            outboundTargetAddress,
            registrationSecret,
            (authToken, version) => {
                // Step 3 — both checks passed: write client and tunnel in one transaction.
                db.transaction(() => {
                    ClientRepository.createOutbound(
                        id,
                        resolvedHostname,
                        outboundTargetAddress,
                        authToken,
                        version,
                    );
                    ClientTunnelRepository.create(id, {
                        sshHost: tunnel.sshHost!,
                        sshPort: tunnel.sshPort,
                        sshUser: tunnel.sshUser!,
                        privateKey: tunnel.privateKey!,
                        passphrase: tunnel.passphrase,
                        hostKeySha256: tunnel.hostKeySha256!,
                    });
                })();
                persisted = true;
            },
        );

        if (!result.ok || !persisted) {
            const reason =
                result.error ??
                "The registration secret may already have been consumed — set a new one on the client host.";
            return reply.code(400).send({
                error: `Registration at the client failed. ${reason}`,
            });
        }

        ProxyService.broadcastClientUpdate();
        return { id, status: "created" };
    }

    /** Immediate reconnect attempt for an offline outbound client, bypassing the backoff. */
    static async reconnect(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const client = ClientRepository.findById(clientId);

        if (!client) {
            return reply.code(404).send({ error: "Client not found" });
        }
        if (client.connection_mode !== "outbound") {
            return reply
                .code(400)
                .send({ error: "Only outbound clients can be dialled" });
        }

        const connected = await ClientConnector.reconnectNow(clientId);
        return { connected };
    }
    /**
     * Retrieves a list of all clients combined with their live WebSocket connection status.
     * @param request - Fastify request
     * @param reply - Fastify reply
     */
    static async list(request: FastifyRequest, reply: FastifyReply) {
        return ProxyService.getClientsWithStatus();
    }

    /**
     * Deletes a client from the database. If the client is currently connected,
     * immediately terminates their WebSocket session.
     * @param request - Fastify request containing the clientId in params
     * @param reply - Fastify reply
     */
    static async delete(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };

        // Stop dialing and tear down the tunnel before the rows disappear — otherwise a
        // pending reconnect would try to reach a client that no longer exists.
        ClientConnector.cancelReconnect(clientId);
        TunnelService.closeClient(clientId);

        const info = ClientRepository.delete(clientId);

        if (info.changes === 0) {
            return reply.code(404).send({ error: "Client not found" });
        }

        // Disconnect if online
        const socket = ProxyService.getClientSocket(clientId);
        if (socket) {
            socket.close(4000, "Client deleted");
            ProxyService.unregisterClient(clientId, socket);
        }

        ProxyService.broadcastClientUpdate();
        return { status: "deleted" };
    }

    static async update(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const parsed = ClientSchema.pick({
            displayName: true,
            outboundTargetAddress: true,
        }).safeParse(request.body);
        if (!parsed.success) {
            return reply
                .code(400)
                .send({ error: parsed.error.issues[0].message });
        }
        const body = parsed.data;

        const client = ClientRepository.findById(clientId);
        if (!client) {
            return reply.code(404).send({ error: "Client not found" });
        }

        let address: string | undefined;
        if (body.outboundTargetAddress !== undefined) {
            if (client.connection_mode !== "outbound") {
                return reply.code(400).send({
                    error: "Only outbound clients have a target address",
                });
            }
            address = normaliseTargetAddress(body.outboundTargetAddress);
            if (!address) {
                return reply.code(400).send({
                    error: "Target address must have the form host:port",
                });
            }
        }

        try {
            const updated = ProxyService.updateClient(clientId, {
                displayName: body.displayName,
                outboundTargetAddress: address,
            });
            if (!updated) {
                return reply.code(404).send({ error: "Client not found" });
            }

            // An open agent socket still points at the old endpoint, and reconnect logic
            // re-reads the row — so drop it and dial the new address right away.
            if (address && address !== client.outbound_target_address) {
                ProxyService.disconnectClient(
                    clientId,
                    "Target address changed",
                );
                ClientConnector.reconnectNow(clientId).catch((e) =>
                    logger.warn(
                        { err: e, clientId },
                        "Reconnect after address change failed",
                    ),
                );
            }
            return { success: true };
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    /**
     * Proxies a request to fetch the backup history directly from the connected client agent.
     * @param request - Fastify request containing the clientId
     * @param reply - Fastify reply
     */
    static async getHistory(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        try {
            const result = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.HISTORY,
                { requestId: request.id },
            );
            return result.history;
            // The payload from client is: { requestId, history: [...] }
        } catch (e: unknown) {
            return reply
                .code(404)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async getFs(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        const { path: fsPath } = request.query as { path: string };

        try {
            const payload = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.FS_LIST,
                { requestId: request.id, path: fsPath || "/" },
            );
            // Payload: { requestId, files: [...], error? }
            return payload.files;
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async getVersion(request: FastifyRequest, reply: FastifyReply) {
        const { clientId } = request.params as { clientId: string };
        try {
            const payload = await ProxyService.sendRequest(
                clientId,
                WS_EVENTS.GET_VERSION,
                { requestId: request.id },
            );
            return payload; // Returns { requestId, version, error? }
        } catch (e: unknown) {
            return reply
                .code(404)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }
}
