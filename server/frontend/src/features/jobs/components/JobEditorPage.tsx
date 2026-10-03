import { useCallback, useState } from 'react';
import { BackupJob } from '@pbcm/shared';
import { ClientJobEditor } from '../../clients/components/ClientJobEditor';
import { JOB_FORM_VIEW, type JobEditorView } from '../../clients/lib/jobEditorView';
import { ClientSelect } from '../../clients/components/ClientSelect';
import { useJobForm } from '../../clients/hooks/useJobForm';
import { useClients } from '../../../queries/clients';
import { useRepositories } from '../../../queries/repositories';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';

interface JobEditorPageProps {
    /**
     * The client the job belongs to, when the surface that opened this page already knows
     * it — from a client's own page, and always when editing. Given, it cannot be changed
     * here: the job is saved to `POST /api/v1/clients/:clientId/jobs`, so moving it would
     * be creating a second job somewhere else, not editing this one.
     */
    lockedClientId?: string;
    /** The job to edit. Absent for a new one. */
    job?: BackupJob;
}

/**
 * The job editor as a page of its own — `/clients/:clientId/jobs/...` when it is reached
 * from a client, `/jobs/...` when it is reached from the job list across all clients.
 *
 * It used to be a state inside those two lists, which is why creating a job was only
 * possible from a client: the form's hook takes a client id, and the global list has none
 * until the operator picks one. Here the id is page state, so the same form serves both —
 * pre-filled and locked in the one case, empty and selectable in the other.
 */
export const JobEditorPage = ({ lockedClientId, job }: JobEditorPageProps) => {
    const { clients } = useClients();
    const { repositories } = useRepositories();

    const [selectedClientId, setSelectedClientId] = useState(lockedClientId ?? '');
    const [view, setView] = useState<JobEditorView>(JOB_FORM_VIEW);

    const jobForm = useJobForm({ clientId: selectedClientId || null, job });
    const { form } = jobForm;

    /**
     * Escape steps out one level at a time: an open list or panel closes back into the
     * form — leaving the page from there would throw away a half-filled form for a key
     * pressed to close a list. Past those it does what the header's X does, including
     * asking.
     */
    const closePanel = useCallback(() => {
        if (view.kind === 'form') return false;
        setView(JOB_FORM_VIEW);
        return true;
    }, [view]);

    // The parent in the route tree — the client's page under the one path family, the job
    // list under the other — with the query the opening surface passed along, so the
    // client's open tab is still open on return.
    const { close, leave } = useUnsavedChangesGuard(form.isDirty, 'job', { onEscape: closePanel });

    /**
     * Only a newly created job leaves afterwards -- there is nothing left to do with a
     * form that has already produced its job. Editing stays put and says so in the
     * footer, the way the client and repository editors do.
     */
    const handleSave = async () => {
        if ((await jobForm.save()) && !job) leave();
    };

    const clientField = (
        <ClientSelect
            clients={clients}
            selectedClientId={selectedClientId}
            isSelecting={view.kind === 'client'}
            onSetIsSelecting={(selecting) => setView(selecting ? { kind: 'client' } : JOB_FORM_VIEW)}
            locked={!!lockedClientId}
            // The archive browser lists the client's file system live over the agent's
            // socket, so a job for an offline client could not be filled in here.
            disableOffline
            onSelect={(id) => {
                setSelectedClientId(id);
                // The paths of the previous client mean nothing on the new one.
                form.set('archives', []);
            }}
        />
    );

    return (
        <ClientJobEditor
            jobForm={jobForm}
            view={view}
            onViewChange={setView}
            clientField={clientField}
            repositories={repositories}
            // The header's X leaves the editor outright -- that is what it says it
            // does, asking only about unsaved work. Only Escape steps out of an open
            // panel first, because a key pressed to close a list must not throw
            // the form away with it.
            onClose={close}
            onSave={handleSave}
        />
    );
};
