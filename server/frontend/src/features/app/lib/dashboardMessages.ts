import {
    DashboardMessageSchema,
    type DashboardMessage,
    type HistoryEntry,
    type StatusUpdatePayload,
} from '@pbcm/shared';

type Report = (message: string, detail: unknown) => void;

/**
 * Turns what the socket delivers into a `DashboardMessage`, or into null for anything
 * that is not one.
 *
 * A message that does not match the contract is dropped rather than half-applied, and
 * reported once per type: a server that sends a wrong `LOG_UPDATE` sends it many times a
 * second, and the first report says everything the thousandth would.
 */
export function createDashboardMessageReader(report: Report = console.error) {
    const reported = new Set<string>();
    const reportOnce = (type: string, detail: unknown) => {
        if (reported.has(type)) return;
        reported.add(type);
        report(`Ignoring dashboard message ${type}:`, detail);
    };

    return (raw: string): DashboardMessage | null => {
        let data: unknown;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            reportOnce('(not JSON)', e);
            return null;
        }

        const parsed = DashboardMessageSchema.safeParse(data);
        if (parsed.success) return parsed.data;

        const type =
            typeof data === 'object' && data !== null && 'type' in data && typeof data.type === 'string'
                ? data.type
                : '(no type)';
        reportOnce(type, parsed.error.issues);
        return null;
    };
}

/**
 * The end of a `switch` over a union: compiles only when every member has a case. What
 * makes a dashboard message without a handler a build failure instead of a silent no-op.
 */
export function assertNever(value: never): never {
    throw new Error(`Unhandled dashboard message: ${JSON.stringify(value)}`);
}

/**
 * An agent's status update in the form the history lists hold their rows.
 *
 * The two differ in what they call the job (`jobId` on the wire, `jobConfigId` in a row)
 * and in how they say "not yet": the update leaves `endTime`, `exitCode` and the output
 * out, a row carries them as null. The subscribers used to be handed the update under the
 * row's type, which was a claim nothing checked.
 */
export function historyUpdateFrom(
    job: StatusUpdatePayload,
): HistoryEntry & Pick<StatusUpdatePayload, 'jobId' | 'error' | 'phase'> {
    return {
        ...job,
        jobConfigId: job.jobId ?? null,
        endTime: job.endTime ?? null,
        exitCode: job.exitCode ?? null,
        stdout: job.stdout ?? null,
        stderr: job.stderr ?? null,
    };
}
