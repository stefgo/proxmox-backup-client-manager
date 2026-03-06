import cron from "node-cron";
import db from "../core/Database.js";
import { SettingsService } from "./SettingsService.js";
import { logger } from "../core/Logger.js";

export class CleanupService {
    static initialize() {
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

            // Unified SQL query using Window Functions
            const result = db
                .prepare(
                    `
                DELETE FROM registration_tokens 
                WHERE token IN (
                    SELECT token FROM (
                        SELECT token, 
                               ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn,
                               COALESCE(used_at, expires_at, created_at) as compare_date
                        FROM registration_tokens
                        WHERE used_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at < datetime("now"))
                    ) 
                    WHERE rn > ? AND compare_date < ?
                )
            `,
                )
                .run(minCount, cutoffStr);

            if (result.changes > 0) {
                logger.info(
                    `Cleaned up ${result.changes} invalid client tokens.`,
                );
            }

            return result.changes;
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

            // Unified SQL query using Window Functions (SQLite 3.25+)
            // This identifies records that are:
            // 1. Beyond the 'minCount' newest records FOR EACH client
            // 2. AND older than the 'retentionDays' cutoff
            const result = db
                .prepare(
                    `
                DELETE FROM job_history 
                WHERE id IN (
                    SELECT id FROM (
                        SELECT id, 
                               ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY start_time DESC) as rn,
                               start_time
                        FROM job_history
                    ) 
                    WHERE rn > ? AND (start_time < ? OR ? = 0)
                )
            `,
                )
                .run(minCount, cutoffStr, retentionDays === 0 ? 0 : 1);

            if (result.changes > 0) {
                logger.info(
                    `Cleaned up ${result.changes} old job history records using optimized query.`,
                );
            }

            return result.changes;
        } catch (e) {
            logger.error({ err: e }, "Failed to cleanup job history");
            return 0;
        }
    }
}
