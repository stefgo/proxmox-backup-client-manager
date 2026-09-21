import { FastifyReply, FastifyRequest } from "fastify";
import { HistoryQuerySchema, firstIssue } from "@pbcm/shared";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";

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
}
