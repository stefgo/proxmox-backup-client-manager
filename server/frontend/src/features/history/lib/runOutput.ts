import { JOB_STATUS, type RunSnapshotDetails } from '@pbcm/shared';
import { runSnapshotLog } from './runSnapshotLog';

/** What of a run decides the text below its expanded row. */
export interface RunOutputInput {
    type: string;
    status: string;
    stdout?: string | null;
    stderr?: string | null;
    error?: string;
    snapshot?: string | null;
    snapshotDetails?: RunSnapshotDetails | null;
    snapshotError?: string | null;
}

export type RunOutput =
    /** Still running, and the agent has sent output since the page was opened. */
    | { kind: 'live'; text: string }
    /** What the run left behind. `failed`: the text is why it failed, not what it did. */
    | { kind: 'log'; text: string; failed: boolean }
    /** Still running, nothing to show yet. */
    | { kind: 'waiting' }
    /** Ended without output. */
    | { kind: 'none' };

/**
 * What an expanded history row shows. A run that is still going has not "no output" --
 * it has none yet, and the row says so instead of looking finished.
 */
export const runOutput = (item: RunOutputInput, liveLines: string[] | undefined): RunOutput => {
    const running = item.status === JOB_STATUS.RUNNING;
    if (running && liveLines && liveLines.length > 0) {
        return { kind: 'live', text: liveLines.join('') };
    }

    const snapshotLog =
        item.type === 'backup' && item.status === JOB_STATUS.SUCCESS
            ? runSnapshotLog({
                snapshot: item.snapshot,
                details: item.snapshotDetails,
                error: item.snapshotError,
            })
            : null;
    // The snapshot goes below the CLI's own output, as its last step.
    const text = [(item.error || item.stderr || item.stdout)?.trimEnd(), snapshotLog]
        .filter(Boolean)
        .join('\n');
    if (text) {
        return {
            kind: 'log',
            text,
            failed: item.status === JOB_STATUS.FAILED && !!(item.error || item.stderr),
        };
    }

    return running ? { kind: 'waiting' } : { kind: 'none' };
};
