import { JobHistoryRepository } from "../repositories/JobHistoryRepository.js";
import { ScheduledJob } from "./ScheduledJob.js";
import { SettingsService } from "./SettingsService.js";
import { logger } from "@pbcm/shared/node";
import type { SchedulerStatus, SchedulerTrigger } from "@pbcm/shared";

export interface JobHistoryCleanupResult {
    removed: number;
}

function readConfig() {
    const ttlDays = parseInt(SettingsService.getSetting("retention_job_history_days") ?? "90", 10);
    const minKeep = parseInt(SettingsService.getSetting("retention_job_history_count") ?? "50", 10);
    const intervalHours = parseInt(
        SettingsService.getSetting("job_history_cleanup_interval_hours") ?? "24",
        10,
    );
    return {
        ttlDays: Number.isFinite(ttlDays) && ttlDays >= 0 ? ttlDays : 90,
        // At least one entry per client always stays: the client page shows its last run.
        minKeep: Number.isFinite(minKeep) ? Math.max(1, minKeep) : 50,
        intervalHours: Number.isFinite(intervalHours) ? intervalHours : 24,
    };
}

const job = new ScheduledJob({
    id: "job-history-cleanup",
    intervalMs: () => readConfig().intervalHours * 60 * 60 * 1000,
});

export class JobHistoryCleanupService {
    /**
     * Removes job history entries older than `retention_job_history_days`, keeping the newest
     * `retention_job_history_count` of every client whatever their age. A retention of 0
     * days means no age limit: only the per-client count decides then.
     */
    static run(trigger: SchedulerTrigger = "schedule"): Promise<JobHistoryCleanupResult> {
        return job.run(trigger, () => {
            const { ttlDays, minKeep } = readConfig();
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - ttlDays);
            const removed = JobHistoryRepository.deleteOld(minKeep, cutoff.toISOString(), ttlDays !== 0);
            logger.info({ removed, ttlDays, minKeep }, "Job history cleanup completed");
            return { removed };
        });
    }

    /** Starts the periodic scheduler; an interval of 0 disables it. */
    static startScheduler(): void {
        job.start(() => this.run("schedule"));
    }

    static stopScheduler(): void {
        job.stop();
    }

    static restartScheduler(): void {
        this.startScheduler();
    }

    static getStatus(): SchedulerStatus<"job-history-cleanup"> {
        return job.status();
    }
}
