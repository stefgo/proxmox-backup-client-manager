import { apiFetch } from '../../../lib/apiFetch';
import type { SectionProps } from '../sections';
import { ManualRunBox, NumberField, SectionHeader } from './SettingsParts';

/** Starts a cleanup and returns what the button shows afterwards; throws when the server refuses. */
async function runCleanup(url: string): Promise<string> {
    const response = await apiFetch(url, { method: 'POST' });
    if (!response.ok) throw new Error('The server refused to start the cleanup');
    const data = (await response.json()) as { removed?: number };
    return typeof data.removed === 'number' ? `Removed ${data.removed}` : 'Done';
}

export const TokenRetentionSection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Retention of invalid client tokens">
            Define how long registration tokens are kept after they become invalid.
        </SectionHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <NumberField
                label="Retention Time (Days)"
                value={values.retention_invalid_tokens_days}
                onChange={(v) => onChange('retention_invalid_tokens_days', v)}
                placeholder="30"
                hint="Number of days an invalid token remains in the database."
            />
            <NumberField
                label="Minimum Keep Count"
                value={values.retention_invalid_tokens_count}
                onChange={(v) => onChange('retention_invalid_tokens_count', v)}
                placeholder="10"
                hint="Ensure at least this many invalid tokens are always kept."
            />
        </div>

        <ManualRunBox
            description="Remove invalid tokens right now, using the retention settings as last saved."
            failureTitle="Could not remove the invalid tokens"
            onRun={() => runCleanup('/api/v1/settings/cleanup/invalid-tokens')}
        />
    </section>
);

export const JobHistorySection = ({ values, onChange }: SectionProps) => (
    <section>
        <SectionHeader title="Retention of global job history">
            Define how long job execution history records are kept on the server.
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
        </div>

        <ManualRunBox
            description="Remove old job history right now, using the retention settings as last saved."
            failureTitle="Could not clean up the job history"
            onRun={() => runCleanup('/api/v1/settings/cleanup/job-history')}
        />
    </section>
);
