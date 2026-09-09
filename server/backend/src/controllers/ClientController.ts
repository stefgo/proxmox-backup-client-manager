import { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { ProxyService } from "../services/ProxyService.js";
import {
    WS_EVENTS,
    CONNECTION_MODE,
    ClientSchema,
    normaliseTargetAddress,
} from "@pbcm/shared";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ClientConnector } from "../services/ClientConnector.js";
import { TunnelService } from "../services/TunnelService.js";
import { logger } from "@pbcm/shared/node";

interface OutboundBody {
    hostname?: string;
    outboundTargetAddress?: string;
    registrationSecret?: string;
}

export class ClientController {
    /**
     * Creates an outbound client — the connection and nothing else.
     *
     * Deliberately no SSH credentials here. Creating a client answers one question, "who
     * dials the WebSocket", and that answer is fixed for good; the tunnel answers another,
     * "how is the PBS reached", and stays revisable for the client's whole life. Tying the
     * reversible decision to the irreversible one is what this endpoint used to do, and it
     * made the tunnel look like a property of the connection mode. It is set up afterwards
     * through `/clients/:id/tunnel`, which tests and pins in the same action.
     */
    static async createOutbound(request: FastifyRequest, reply: FastifyReply) {
        const body = (request.body ?? {}) as OutboundBody;
        const { hostname, outboundTargetAddress, registrationSecret } = body;

        if (!outboundTargetAddress || !registrationSecret) {
            return reply.code(400).send({
                error: "outboundTargetAddress and registrationSecret are required",
            });
        }

        // Registration and AUTH. Nothing is written before this succeeds.
        const id = randomUUID();
        const resolvedHostname = hostname?.trim() || outboundTargetAddress;
        let persisted = false;

        const result = await ClientConnector.firstConnect(
            id,
            outboundTargetAddress,
            registrationSecret,
            (authToken, version) => {
                // The handshake stood — only now does the client become a row.
                ClientRepository.createOutbound(
                    id,
                    resolvedHostname,
                    outboundTargetAddress,
                    authToken,
                    version,
                );
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
        if (client.connection_mode !== CONNECTION_MODE.OUTBOUND) {
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
            inboundAllowedIp: true,
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
            if (client.connection_mode !== CONNECTION_MODE.OUTBOUND) {
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

        if (body.inboundAllowedIp !== undefined) {
            if (client.connection_mode === CONNECTION_MODE.OUTBOUND) {
                return reply.code(400).send({
                    error: "Only inbound clients have an allowed address",
                });
            }
        }

        try {
            const updated = ProxyService.updateClient(clientId, {
                displayName: body.displayName,
                outboundTargetAddress: address,
                inboundAllowedIp: body.inboundAllowedIp,
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
