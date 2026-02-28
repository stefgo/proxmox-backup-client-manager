import { FastifyReply, FastifyRequest } from "fastify";
import db from "../core/Database.js";

export class HistoryController {
    /**
     * Fetch global history sorted by start_time descending.
     * Optionally takes limit/offset as query parameters.
     */
    static async getGlobalHistory(req: FastifyRequest, reply: FastifyReply) {
        try {
            const query = req.query as { limit?: string; offset?: string };
            const limit = query.limit ? parseInt(query.limit, 10) : 100;
            const offset = query.offset ? parseInt(query.offset, 10) : 0;

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
                .status(500)
                .send({ success: false, error: "Internal Server Error" });
        }
    }
}
