import { FastifyReply, FastifyRequest } from "fastify";
import { HistoryQuerySchema, HistorySeen, firstIssue } from "@pbcm/shared";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { HistorySeenRepository } from "../repositories/HistorySeenRepository.js";
import { ProxyService } from "../services/ProxyService.js";

/** The session's user; every route here sits behind the JWT hook, which sets it. */
function sessionUser(req: FastifyRequest): string | null {
    const user = req.user as { username?: unknown } | undefined;
    return typeof user?.username === "string" && user.username ? user.username : null;
}

function seenState(username: string): HistorySeen {
    const seenAt = HistorySeenRepository.get(username);
    return { seenAt, unseenFailed: JobHistoryRepository.countFailedSince(seenAt) };
}

export class HistoryController {
    /**
     * Fetch global history sorted by start_time descending.
     * Optionally takes limit/offset as query parameters.
     */
    static async getGlobalHistory(req: FastifyRequest, reply: FastifyReply) {
        try {
            // Bounded rather than parsed: `parseInt("abc")` used to hand NaN to a SQLite
            // binding, and SQLite reads a negative LIMIT as "no limit" -- so `?limit=-1`
            // returned the whole table.
            const parsed = HistoryQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                // This endpoint answers with a `success` flag, unlike the others -- kept
                // so the frontend's existing error handling still recognises the shape.
                return reply.code(400).send({
                    success: false,
                    error: firstIssue(parsed.error),
                });
            }
            const { limit, offset } = parsed.data;

            const records = JobHistoryRepository.findGlobal(limit, offset);

            return reply.send({
                success: true,
                count: records.length,
                data: records,
            });
        } catch (error) {
            req.log.error({
                msg: "Failed to fetch global history",
                err: error,
            });
            return reply
                .code(500)
                .send({ success: false, error: "Internal Server Error" });
        }
    }

    /** How far the session's user has looked at the history. */
    static async getSeen(req: FastifyRequest, reply: FastifyReply) {
        const username = sessionUser(req);
        if (!username) return reply.code(401).send({ error: "No user in session" });
        return reply.send(seenState(username));
    }

    /**
     * Records that the session's user has looked at the history now. Broadcast as
     * `HISTORY_SEEN`, so the user's other tabs clear the mark as well; every dashboard
     * receives it and keeps only its own user's.
     */
    static async markSeen(req: FastifyRequest, reply: FastifyReply) {
        const username = sessionUser(req);
        if (!username) return reply.code(401).send({ error: "No user in session" });

        HistorySeenRepository.set(username, new Date().toISOString());
        const state = seenState(username);
        ProxyService.broadcastToDashboard({
            type: "HISTORY_SEEN",
            payload: { username, ...state },
        });
        return reply.send(state);
    }
}
