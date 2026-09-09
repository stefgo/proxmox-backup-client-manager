import { FastifyReply, FastifyRequest } from "fastify";
import { HistoryQuerySchema } from "@pbcm/shared";
import { firstIssue } from "../utils/validation.js";
import db from "../core/Database.js";

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

            const records = db
                .prepare(
                    `
                SELECT 
                    h.id, h.client_id as clientId, h.job_id as jobId, h.name, 
                    h.type, h.status, h.start_time as startTime, h.end_time as endTime, 
                    h.exit_code as exitCode, h.stdout, h.stderr,
                    c.hostname, c.display_name as displayName
                FROM job_history h
                LEFT JOIN clients c ON h.client_id = c.id
                ORDER BY h.start_time DESC
                LIMIT ? OFFSET ?
            `,
                )
                .all(limit, offset);

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
