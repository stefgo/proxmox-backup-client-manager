import { BackupJobSchema, type BackupJob } from '@pbcm/shared';
import { useEntityForm } from '../../../hooks/useEntityForm';
import { useClient } from '../../../queries/clients';
import { useSaveJob } from '../../../queries/jobs';
import { emptyJobDraft, jobDraftFrom, jobFieldOf, jobInputFrom, jobRules, type JobDraft } from '../lib/jobForm';

interface UseJobFormProps {
    /** The client the job is saved to. `null` until one is chosen. */
    clientId: string | null;
    /** The job to edit. Absent for a new one. */
    job?: BackupJob;
}

/**
 * The job editor's form: the draft of one job, checked against `BackupJobSchema`, and what
 * the draft needs to know about the client it is for.
 *
 * What the editor's panels keep while they are open -- the directory the file browser
 * stands in, an archive or a pattern not confirmed yet -- is theirs, not the form's.
 */
export const useJobForm = ({ clientId, job }: UseJobFormProps) => {
    const jobId = job?.id ?? null;
    const { mutateAsync: saveJob } = useSaveJob();

    const form = useEntityForm({
        schema: BackupJobSchema,
        initial: () => (job ? jobDraftFrom(job, new Date()) : emptyJobDraft(new Date())),
        toInput: (draft: JobDraft) => jobInputFrom(draft, jobId),
        fieldOf: jobFieldOf,
        rules: jobRules,
    });

    // Whether the client has SSH credentials at all. Read from the cache rather than
    // passed in: the caller has the client id and nothing else to add. A job that is
    // already set to use the tunnel keeps the control usable even if the cache has no
    // client row yet — otherwise the setting could be seen but never turned off.
    const client = useClient(clientId);
    const tunnelAvailable = !!client?.tunnelConfigured || form.draft.tunnelRequired;

    /**
     * Stores the job on the chosen client. Resolves `true` once it is stored; a refusal --
     * the backend names the setting a client cannot serve -- is the form's `saveError`.
     */
    const save = async () => {
        if (!clientId) return false;
        return form.submit((input) => saveJob({ clientId, job: input }));
    };

    return {
        form,
        clientId,
        isEditing: jobId !== null,
        jobId,
        tunnelAvailable,
        // The clock the agent repeats the schedule on, shown next to it. `null` until the
        // agent has reported one.
        agentTimezone: client?.timezone ?? null,
        save,
    };
};

export type JobForm = ReturnType<typeof useJobForm>;
