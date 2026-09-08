import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import {
    CreateRegistrationTokenSchema,
    RegistrationPayloadSchema,
    isIpInCidr,
    isWildcardNetwork,
} from "@pbcm/shared";
import { firstIssue } from "../utils/validation.js";
import { TokenRepository } from "../repositories/TokenRepository.js";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { ProxyService } from "../services/ProxyService.js";

export const TokenController = {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
        const tokens = TokenRepository.findAll();
        return tokens.map((t) => ({
            ...t,
            createdAt: t.created_at,
            expiresAt: t.expires_at,
            usedAt: t.used_at,
            displayName: t.display_name ?? undefined,
            allowedIp: t.allowed_ip ?? undefined,
        }));
    },

    create: async (request: FastifyRequest, reply: FastifyReply) => {
        // The body is optional: a token with neither value behaves exactly as
        // it did before this endpoint learned about them.
        const parsed = CreateRegistrationTokenSchema.safeParse(
            request.body ?? {},
        );
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }

        // Rejected here as well as in the client editor: this is the other way a value
        // reaches clients.inbound_allowed_ip, and a /0 there would switch the per-client
        // address check off for every agent registered with this token.
        if (
            parsed.data.allowedIp !== undefined &&
            isWildcardNetwork(parsed.data.allowedIp)
        ) {
            return reply.code(400).send({
                error: "A /0 network allows every address and is not a valid pin",
            });
        }

        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        TokenRepository.create(token, expiresAt, parsed.data);
        return { token, expiresAt, ...parsed.data };
    },

    delete: async (request: FastifyRequest, reply: FastifyReply) => {
        const { token } = request.params as { token: string };
        TokenRepository.delete(token);
        return { status: "deleted" };
    },

    register: async (request: FastifyRequest, reply: FastifyReply) => {
        // The one unauthenticated endpoint with a body, so the shape is checked before
        // anything else happens. Ahead of the token lookup on purpose: a malformed request
        // should not learn from the status code whether the token it sent exists.
        const parsed = RegistrationPayloadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { token, clientId } = parsed.data;
        const hostname = parsed.data.hostname || "unknown";

        const tokenRow = TokenRepository.findValidByToken(token);

        if (!tokenRow) {
            return reply.code(403).send({ error: "Invalid or expired token" });
        }

        try {
            // A token bound to a network may only be redeemed from inside it.
            // Checked before anything is written: the agent consumes its
            // one-time secret on a successful call, so a rejection has to leave
            // the token unused.
            if (
                tokenRow.allowed_ip &&
                !isIpInCidr(request.ip, tokenRow.allowed_ip)
            ) {
                request.log.warn({
                    msg: "Registration denied: address outside the token's network",
                    ip: request.ip,
                    expected: tokenRow.allowed_ip,
                });
                return reply.code(403).send({
                    error: "Registration is not allowed from this address",
                });
            }

            // Generate Auth Token
            const authToken = crypto.randomBytes(64).toString("hex");

            // The operator's choice wins over the address the agent happens to
            // dial from: only the former is a decision. Without one, the
            // registering address stays the pin, as before.
            // (Requires trustProxy: true in Fastify config if behind proxy)
            const allowedIp = tokenRow.allowed_ip ?? request.ip;

            TokenRepository.markUsed(token);

            ClientRepository.upsert(clientId, hostname, authToken, allowedIp);

            if (tokenRow.display_name) {
                ClientRepository.updateDisplayName(
                    clientId,
                    tokenRow.display_name,
                );
            }

            ProxyService.broadcastClientUpdate();

            return { token: authToken, clientId };
        } catch (e: unknown) {
            request.log.error({ err: e }, "Registration failed");
            return reply.code(500).send({ error: "Registration failed" });
        }
    },
};
