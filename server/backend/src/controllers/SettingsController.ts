import { FastifyRequest, FastifyReply } from "fastify";
import { CleanupSettingsSchema, firstIssue, type SchedulerStatuses } from "@pbcm/shared";
import { SettingsService } from "../services/SettingsService.js";
import { TokenCleanupService } from "../services/TokenCleanupService.js";
import { JobHistoryCleanupService } from "../services/JobHistoryCleanupService.js";

export class SettingsController {
    static async getSettings(request: FastifyRequest, reply: FastifyReply) {
        try {
            const settings = SettingsService.getAllSettings();
            return reply.send(settings);
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to fetch settings" });
        }
    }

    static async updateSettings(request: FastifyRequest, reply: FastifyReply) {
        // This body ends up in config.yaml, and a `security` block in it replaces the one
        // that decides which networks may register a client -- so it is checked, but
        // loosely: see the note on CleanupSettingsSchema for why unknown keys survive.
        const parsed = CleanupSettingsSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }

        try {
            SettingsService.updateSettings(parsed.data);
            return reply.send({ success: true });
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to update settings" });
        }
    }

    /** Both cleanups, one after the other, each recorded as a manual run of its scheduler. */
    static async runMaintenance(request: FastifyRequest, reply: FastifyReply) {
        try {
            const tokens = await TokenCleanupService.run("manual");
            const history = await JobHistoryCleanupService.run("manual");
            return reply.send({
                success: true,
                tokens: tokens.removed,
                history: history.removed,
            });
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to run maintenance" });
        }
    }

    // One cleanup each, for the settings tab that shapes it. runMaintenance above stays
    // for callers that want both at once.
    static async cleanupInvalidTokens(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { removed } = await TokenCleanupService.run("manual");
            return reply.send({ removed });
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to clean up invalid tokens" });
        }
    }

    static async cleanupJobHistory(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { removed } = await JobHistoryCleanupService.run("manual");
            return reply.send({ removed });
        } catch (e) {
            request.log.error(e);
            return reply
                .code(500)
                .send({ error: "Failed to clean up job history" });
        }
    }

    /** Every scheduler the server runs: whether it is running, its next and its last run. */
    static async getSchedulerStatus(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send({
            schedulers: {
                "token-cleanup": TokenCleanupService.getStatus(),
                "job-history-cleanup": JobHistoryCleanupService.getStatus(),
            } satisfies SchedulerStatuses,
        });
    }
}
