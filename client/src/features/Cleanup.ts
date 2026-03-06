import cron from "node-cron";
import db from "../core/Database.js";
import { config } from "../core/Config.js";
import { Logger } from "../core/Logger.js";

export class Cleanup {
    static initialize() {
        // Schedule daily at 00:00
        cron.schedule("0 0 * * *", () => {
            this.run();
        });
        Logger.info("CleanupService initialized (Daily at 00:00)");
    }

    /**
     * Runs the database cleanup task. Deletes old entries from job_history
     * and job_schedule_state based on the configured retentionTime.
     */
    static run() {
        Logger.info(
            `Running scheduled database cleanup (retention: ${config.retentionTime} days)...`,
        );

        try {
            const retentionDays = config.retentionTime;

            // Calculate cutoff date string in ISO format (YYYY-MM-DDTHH:MM:SS.SSSZ)
            // SQLite can compare these strings lexicographically or using date/time functions.
            // We'll use datetime('now', '-N days') for robust SQLite comparison.

            // 1. Cleanup job_history
            // We use updated_at as the primary reference, falling back to start_time if needed.
            // But since updated_at is always set (default CURRENT_TIMESTAMP), we use that.
            const historyResult = db
                .prepare(
                    `
                DELETE FROM job_history 
                WHERE updated_at < datetime('now', '-' || ? || ' days')
            `,
                )
                .run(retentionDays);

            // 2. Cleanup job_schedule_state
            // If a job hasn't run in X days, we might want to keep it, but the user requested cleanup.
            // Usually, this table stores the next_run and last_run for active jobs.
            // If a job is DELETED, it should ideally be cleaned up too.
            // Requirement said "cleanup der Tabelle job_history und job_schedule_state".
            // For job_schedule_state, we delete entries where last_run is older than retention
            // AND the job doesn't exist anymore? Or just based on age?
            // If we delete from job_schedule_state while the job still exists, it will be re-initialized.
            // Let's stick to cleaning up orphan or very old state entries.

            // Let's check for orphaned states first (jobs that no longer exist)
            const orphanResult = db
                .prepare(
                    `
                DELETE FROM job_schedule_state 
                WHERE id NOT IN (SELECT id FROM job)
            `,
                )
                .run();

            // Then cleanup old states where last_run is very old
            const stateResult = db
                .prepare(
                    `
                DELETE FROM job_schedule_state 
                WHERE last_run < datetime('now', '-' || ? || ' days')
                AND id NOT IN (SELECT id FROM job) -- Extra safety: only if job is gone or we really want to reset state
            `,
                )
                .run(retentionDays);

            Logger.info(
                `Cleanup completed. Deleted ${historyResult.changes} job history records and ${orphanResult.changes + stateResult.changes} schedule state entries.`,
            );
        } catch (e) {
            Logger.error("Failed to run database cleanup", e);
        }
    }
}
