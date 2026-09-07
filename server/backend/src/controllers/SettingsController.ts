import { FastifyRequest, FastifyReply } from "fastify";
import { CleanupSettingsSchema } from "@pbcm/shared";
import { firstIssue } from "../utils/validation.js";
import { SettingsService } from "../services/SettingsService.js";

export const SettingsController = {
    async getSettings(request: FastifyRequest, reply: FastifyReply) {
        try {
            const settings = SettingsService.getAllSettings();
            return reply.send(settings);
        } catch (e) {
            request.log.error(e);
            return reply
                .status(500)
                .send({ error: "Failed to fetch settings" });
        }
    },

    async updateSettings(request: FastifyRequest, reply: FastifyReply) {
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
                .status(500)
                .send({ error: "Failed to update settings" });
        }
    },

    async runMaintenance(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { CleanupService } =
                await import("../services/CleanupService.js");
            const tokens = CleanupService.cleanupTokens();
            const history = CleanupService.cleanupJobHistory();
            return reply.send({ success: true, tokens, history });
        } catch (e) {
            request.log.error(e);
            return reply
                .status(500)
                .send({ error: "Failed to run maintenance" });
        }
    },
};
