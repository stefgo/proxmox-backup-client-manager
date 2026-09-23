import { apiFetch } from '../../../lib/apiFetch';
import type { SectionProps } from '../sections';
import { ManualRun, NumberField, SectionHeader } from './SettingsParts';
import { SchedulerBox } from './SchedulerBox';

/** Starts a cleanup and returns what the button shows afterwards; throws when the server refuses. */
async function runCleanup(url: string): Promise<string> {
    const response = await apiFetch(url, { method: 'POST' });
    if (!response.ok) throw new Error('The server refused to start the cleanup');
    const data = (await response.json()) as { removed?: number };
    return typeof data.removed === 'number' ? `Removed ${data.removed}` : 'Done';
}

const INTERVAL_HINT = 'Hours between two automatic runs. Set to 0 to disable the timer; Run Now still works.';

export const TokenRetentionSection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Retention of invalid client tokens">
            Define how long registration tokens are kept after they become invalid, and how often
            they are cleaned up.
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <NumberField
                label="Retention Time (Days)"
                value={values.token_retention_days}
                onChange={(v) => onChange('token_retention_days', v)}
                placeholder="30"
                hint="Number of days an invalid token remains in the database."
            />
            <NumberField
                label="Cleanup Interval (Hours)"
                value={values.token_cleanup_interval_hours}
                onChange={(v) => onChange('token_cleanup_interval_hours', v)}
                placeholder="24"
                hint={INTERVAL_HINT}
            />
        </div>

        <SchedulerBox scheduler="token-cleanup">
            <ManualRun
                description="Remove invalid tokens right now, using the retention settings as last saved."
                failureTitle="Could not remove the invalid tokens"
                onRun={() => runCleanup('/api/v1/settings/cleanup/invalid-tokens')}
            />
        </SchedulerBox>
    </section>
);

export const JobHistorySection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Retention of global job history">
            Define how long job execution history records are kept on the server, and how often
            they are cleaned up.
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <NumberField
                label="Retention Time (Days)"
                value={values.retention_job_history_days}
                onChange={(v) => onChange('retention_job_history_days', v)}
                placeholder="90"
                hint="Number of days job history entries remain in the database. Set to 0 to keep them regardless of age."
            />
            <NumberField
                label="Minimum Keep Count (per client)"
                value={values.retention_job_history_count}
                onChange={(v) => onChange('retention_job_history_count', v)}
                min={1}
                placeholder="50"
                hint="Ensure at least this many entries are kept for each client."
            />
            <NumberField
                label="Cleanup Interval (Hours)"
                value={values.job_history_cleanup_interval_hours}
                onChange={(v) => onChange('job_history_cleanup_interval_hours', v)}
                placeholder="24"
                hint={INTERVAL_HINT}
            />
        </div>

        <SchedulerBox scheduler="job-history-cleanup">
            <ManualRun
                description="Remove old job history right now, using the retention settings as last saved."
                failureTitle="Could not clean up the job history"
                onRun={() => runCleanup('/api/v1/settings/cleanup/job-history')}
            />
        </SchedulerBox>
    </section>
);
