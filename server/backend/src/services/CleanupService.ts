import cron from "node-cron";
import { TokenRepository } from "../repositories/TokenRepository.js";
import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { SettingsService } from "./SettingsService.js";
import { logger } from "@pbcm/shared/node";

export class CleanupService {
    static async initialize() {
        logger.info("Initializing CleanupService...");

        // Run on startup
        this.cleanupTokens();

        // Schedule daily at 00:00
        cron.schedule("0 0 * * *", () => {
            logger.info("Running scheduled maintenance cleanup...");
            this.cleanupTokens();
            this.cleanupJobHistory();
        });
    }

    static cleanupTokens() {
        try {
            const retentionDaysStr =
                SettingsService.getSetting("retention_invalid_tokens_days") ||
                "30";
            const minCountStr =
                SettingsService.getSetting("retention_invalid_tokens_count") ||
                "10";

            const retentionDays = Math.max(0, parseInt(retentionDaysStr));
            const minCount = Math.max(0, parseInt(minCountStr));

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffStr = cutoffDate.toISOString();

            const changes = TokenRepository.deleteExpired(minCount, cutoffStr);

            if (changes > 0) {
                logger.info(`Cleaned up ${changes} invalid client tokens.`);
            }

            return changes;
        } catch (e) {
            logger.error({ err: e }, "Failed to cleanup tokens");
            return 0;
        }
    }

    static cleanupJobHistory() {
        try {
            const retentionDaysStr =
                SettingsService.getSetting("retention_job_history_days") ||
                "90";
            const minCountStr =
                SettingsService.getSetting("retention_job_history_count") ||
                "50";

            const retentionDays = Math.max(0, parseInt(retentionDaysStr));
            const minCount = Math.max(1, parseInt(minCountStr));

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffStr = cutoffDate.toISOString();

            // A retention of 0 days means "no age limit": only the per-client count
            // decides then, so the cutoff is not enforced.
            const changes = JobHistoryRepository.deleteOld(
                minCount,
                cutoffStr,
                retentionDays !== 0,
            );

            if (changes > 0) {
                logger.info(
                    `Cleaned up ${changes} old job history records using optimized query.`,
                );
            }

            return changes;
        } catch (e) {
            logger.error({ err: e }, "Failed to cleanup job history");
            return 0;
        }
    }
}
