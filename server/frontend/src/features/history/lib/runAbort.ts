import { JOB_PHASE, JOB_STATUS } from '@pbcm/shared';

/** What of a run decides whether it can still be stopped. */
export interface AbortableRun {
    status: string;
    /** Set on a live update while the run is still `running` after its CLI exited. */
    phase?: string | null;
}

/**
 * Whether a run can be asked to stop: one that is under way, or queued behind another run
 * of its job.
 *
 * Not one that is reading back its snapshot. Its backup is finished and in the repository
 * by then; the agent refuses the request, so the row does not offer it.
 */
export const canAbortRun = (run: AbortableRun): boolean =>
    run.status === JOB_STATUS.QUEUED ||
    (run.status === JOB_STATUS.RUNNING && run.phase !== JOB_PHASE.SNAPSHOT);
