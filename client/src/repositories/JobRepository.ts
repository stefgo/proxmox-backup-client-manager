import { z } from "zod";
import {
    BackupJob,
    Repository,
    ScheduleConfig,
    ScheduleConfigSchema,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import {
    quarantineFile,
    readJsonFile,
    writeJsonFile,
} from "../core/DataStore.js";
import { JobScheduleStateRepository } from "./JobScheduleStateRepository.js";

export const JOBS_FILE = "jobs.json";

/**
 * One job as `jobs.json` holds it. `config` and `schedule` are kept as the objects they are,
 * not as the JSON strings the table used to hold -- `JobRow` below turns them back into
 * strings for the callers that still parse them.
 *
 * Tolerant on purpose: `schedule` is not checked against ScheduleConfigSchema here, because
 * an entry that failed would be dropped with its whole job on the next write. Its readers
 * validate it where they use it and treat a bad one as "no schedule", as they always have.
 */
export const StoredJobSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    config: z.record(z.string(), z.unknown()),
    schedule: z.unknown().nullable().default(null),
    scheduleEnabled: z.boolean(),
    createdAt: z.string(),
});
export type StoredJob = z.infer<typeof StoredJobSchema>;

export interface JobRow {
    id: string;
    name: string;
    config: string;
    schedule_enabled: number;
    schedule: string | null;
}

function toRow(job: StoredJob): JobRow {
    return {
        id: job.id,
        name: job.name,
        config: JSON.stringify(job.config),
        schedule_enabled: job.scheduleEnabled ? 1 : 0,
        schedule: job.schedule === null ? null : JSON.stringify(job.schedule),
    };
}

/**
 * Reads the stored entries, keeping each one that parses. A file that is not a list, or holds
 * an entry that does not parse, is set aside and what could be read is written back at once:
 * this file is the only copy of the job configuration, and a damaged one must be neither
 * overwritten nor left as the version the next start reads.
 */
export function parseStoredJobs(stored: unknown): {
    jobs: StoredJob[];
    dropped: number;
} {
    if (!Array.isArray(stored)) return { jobs: [], dropped: stored === null ? 0 : 1 };
    const jobs: StoredJob[] = [];
    let dropped = 0;
    for (const entry of stored) {
        const parsed = StoredJobSchema.safeParse(entry);
        if (parsed.success) jobs.push(parsed.data);
        else dropped++;
    }
    return { jobs, dropped };
}

/**
 * The agent's jobs. This is the only copy of their configuration: the server lists, saves
 * and deletes them through the agent and keeps none of it, and the scheduler runs them from
 * here whether or not the server can be reached.
 */
export class JobRepository {
    private static jobs: Map<string, StoredJob> | null = null;

    private static load(): Map<string, StoredJob> {
        if (this.jobs) return this.jobs;

        const { jobs, dropped } = parseStoredJobs(
            readJsonFile(JOBS_FILE, { quarantine: true }),
        );
        this.jobs = new Map(jobs.map((job) => [job.id, job]));

        if (dropped > 0) {
            const movedTo = quarantineFile(JOBS_FILE);
            writeJsonFile(JOBS_FILE, jobs);
            logger.error(
                { dropped, kept: jobs.length, movedTo },
                "Dropped job entries that do not parse; the original file was set aside",
            );
        }

        JobScheduleStateRepository.pruneOrphans(new Set(this.jobs.keys()));
        return this.jobs;
    }

    /**
     * Writes the given set and adopts it only once it is on disk. A save the server is told
     * succeeded has to survive a restart; one that could not be written throws, so the
     * handler reports it instead.
     */
    private static commit(next: Map<string, StoredJob>): void {
        if (!writeJsonFile(JOBS_FILE, [...next.values()])) {
            throw new Error("Could not store the job configuration on disk");
        }
        this.jobs = next;
    }

    static findAll(): JobRow[] {
        return [...this.load().values()].map(toRow);
    }

    static getAllWithScheduleState(): BackupJob[] {
        const jobs = [...this.load().values()].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
        );

        return jobs.map((job) => {
            const config = job.config as Partial<BackupJob>;
            const state = JobScheduleStateRepository.findById(job.id);

            // Validated rather than cast: a legacy or corrupt entry should surface as
            // "no schedule" instead of a half-built object that the UI then renders
            // and the scheduler cannot act on.
            let schedule: ScheduleConfig | null = null;
            if (job.schedule !== null) {
                const parsed = ScheduleConfigSchema.safeParse(job.schedule);
                if (parsed.success) schedule = parsed.data;
            }

            return {
                id: job.id,
                name: job.name,
                archives: config.archives ?? [],
                excludes: config.excludes ?? [],
                schedule,
                scheduleEnabled: job.scheduleEnabled,
                // `?? undefined` rather than null: a job that has never run has no state,
                // and these three are optional strings on BackupJob -- a null would fail
                // JobSchema.
                createdAt: job.createdAt,
                nextRunAt: state?.next_run ?? undefined,
                lastRunAt: state?.last_run ?? undefined,
                // Required on BackupJob, but only present on a job whose config carries
                // one. One without is corrupt and reaches callers as undefined, which is
                // what they have always been handed here.
                repository: config.repository as Repository,
                encryption: config.encryption,
                tunnel: config.tunnel,
            };
        });
    }

    static findById(id: string): JobRow | undefined {
        const job = this.load().get(id);
        return job ? toRow(job) : undefined;
    }

    /**
     * Takes `config` and `schedule` as the JSON strings the callers build, and stores the
     * objects. `createdAt` is kept across updates: it orders the list in the UI.
     */
    static upsert(
        id: string,
        name: string,
        config: string,
        scheduleEnabled: number,
        schedule: string | null,
    ): void {
        const current = this.load();
        const next = new Map(current);
        next.set(id, {
            id,
            name,
            config: JSON.parse(config),
            schedule: schedule === null ? null : JSON.parse(schedule),
            scheduleEnabled: Boolean(scheduleEnabled),
            createdAt: current.get(id)?.createdAt ?? new Date().toISOString(),
        });
        this.commit(next);
    }

    /**
     * Replaces only the config. Used when a run corrects a stale value inside it
     * (currently the PBS fingerprint) — going through upsert would require restating
     * the schedule and risk overwriting it with a stale copy.
     */
    static updateConfig(id: string, config: string): void {
        const current = this.load();
        const job = current.get(id);
        if (!job) return;
        const next = new Map(current);
        next.set(id, { ...job, config: JSON.parse(config) });
        this.commit(next);
    }

    /** Deletes the job together with its schedule state, which means nothing without it. */
    static delete(id: string): void {
        const current = this.load();
        if (current.has(id)) {
            const next = new Map(current);
            next.delete(id);
            this.commit(next);
        }
        JobScheduleStateRepository.delete(id);
    }
}
