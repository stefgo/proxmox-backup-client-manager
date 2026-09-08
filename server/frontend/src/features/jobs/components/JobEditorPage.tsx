import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BackupJob } from '@pbcm/shared';
import { ConfirmDialog } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { ClientJobEditor } from '../../clients/components/ClientJobEditor';
import { ClientSelect } from '../../clients/components/ClientSelect';
import { useJobForm } from '../../clients/hooks/useJobForm';
import { useClientStore } from '../../../stores/useClientStore';
import { useClientDetailStore } from '../../../stores/useClientDetailStore';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { useGlobalJobsStore } from '../../../stores/useGlobalJobsStore';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';

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
    /** Where closing and saving return to when the URL was opened directly. */
    fallbackBack: string;
}

/**
 * The job editor as a page of its own — `/client/:clientId/jobs/...` when it is reached
 * from a client, `/jobs/...` when it is reached from the job list across all clients.
 *
 * It used to be a state inside those two lists, which is why creating a job was only
 * possible from a client: the form's hook takes a client id, and the global list has none
 * until the operator picks one. Here the id is page state, so the same form serves both —
 * pre-filled and locked in the one case, empty and selectable in the other.
 */
export const JobEditorPage = ({ lockedClientId, job, fallbackBack }: JobEditorPageProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    // The same `from` convention the client editors use — the surface that opened this
    // page says where back is; a directly opened URL falls back to its own list.
    const back = (location.state as { from?: string } | null)?.from ?? fallbackBack;

    const { token } = useAuth();
    const { clients } = useClientStore();
    const { repositories, fetchRepositories } = useRepositoryStore();
    const { fileList, isLoadingFiles, fetchFileList } = useClientFileSystemStore();
    const fetchAllJobs = useGlobalJobsStore((s) => s.fetchAllJobs);
    const fetchClientData = useClientDetailStore((s) => s.fetchClientData);

    const [selectedClientId, setSelectedClientId] = useState(lockedClientId ?? '');
    const [isSelectingClient, setIsSelectingClient] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    /**
     * Both lists this page returns to are fed from stores, and neither is mounted while
     * the editor is. Refreshing them here is what makes the saved job visible on arrival.
     *
     * Only a newly created job leaves afterwards -- there is nothing left to do with a
     * form that has already produced its job. Editing stays put and says so in the
     * footer, the way the client and repository editors do.
     */
    const handleSaveSuccess = useCallback((wasEditing: boolean) => {
        fetchAllJobs();
        if (selectedClientId) fetchClientData(selectedClientId);
        if (!wasEditing) navigate(back);
    }, [fetchAllJobs, fetchClientData, selectedClientId, navigate, back]);

    const jobForm = useJobForm({
        clientId: selectedClientId || null,
        onSaveSuccess: handleSaveSuccess,
    });

    useEffect(() => {
        if (token && repositories.length === 0) fetchRepositories();
    }, [token, repositories.length, fetchRepositories]);

    // Seeds the form exactly once. Neither jobForm nor its actions keep their identity
    // across renders, so there is no honest dependency array to write here — the guard
    // does the job instead, the same way the job list's editor wrapper did.
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current) return;
        seeded.current = true;
        if (job) {
            jobForm.startEditJob(job);
        } else {
            jobForm.startCreateJob();
        }
    });

    const { fileBrowserPath } = jobForm;
    useEffect(() => {
        if (token && selectedClientId) {
            fetchFileList(selectedClientId, fileBrowserPath);
        }
    }, [token, selectedClientId, fileBrowserPath, fetchFileList]);

    /**
     * Leaving asks first while the form holds unsaved work — the exit sits a few pixels
     * from the fields it would throw away, and the same dialog the client and repository
     * editors use is what stands between the two.
     */
    const { isDirty } = jobForm;
    const leave = useCallback(() => {
        if (isDirty) {
            setConfirmDiscard(true);
            return;
        }
        navigate(back);
    }, [isDirty, navigate, back]);

    /**
     * Escape steps out one level at a time: an open client or repository list closes back
     * into the form — leaving the page from there would throw away a half-filled form for
     * a key pressed to close a list. Past those it does what the header's X does,
     * including asking.
     */
    const { isSelectingRepository, setIsSelectingRepository } = jobForm;
    const requestClose = useCallback(() => {
        if (isSelectingClient) {
            setIsSelectingClient(false);
            return;
        }
        if (isSelectingRepository) {
            setIsSelectingRepository(false);
            return;
        }
        leave();
    }, [isSelectingClient, isSelectingRepository, setIsSelectingRepository, leave]);

    // Not while a select, a dialog or an autocomplete is using Escape for itself.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            requestClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [requestClose]);

    const clientField = (
        <ClientSelect
            clients={clients}
            selectedClientId={selectedClientId}
            isSelecting={isSelectingClient}
            onSetIsSelecting={setIsSelectingClient}
            locked={!!lockedClientId}
            // The archive browser lists the client's file system live over the agent's
            // socket, so a job for an offline client could not be filled in here.
            disableOffline
            onSelect={(id) => {
                setSelectedClientId(id);
                // The paths of the previous client mean nothing on the new one.
                jobForm.setJobArchives([]);
                jobForm.setFileBrowserPath('/');
            }}
        />
    );

    return (
        <>
            <ClientJobEditor
                {...jobForm}
                clientField={clientField}
                isSelectingClient={isSelectingClient}
                hasClient={!!selectedClientId}
                // The header's X leaves the editor outright -- that is what it says it
                // does, asking only about unsaved work. Only Escape steps out of an open
                // sub-list first, because a key pressed to close a list must not throw
                // the form away with it.
                onClose={leave}
                repositories={repositories}
                fileList={fileList}
                isLoadingFiles={isLoadingFiles}
            />

            <ConfirmDialog
                isOpen={confirmDiscard}
                onClose={() => setConfirmDiscard(false)}
                onConfirm={() => navigate(back)}
                title="Discard your changes?"
                description="The job has not been saved. Leaving now keeps it as it was."
                confirmLabel="Discard"
                cancelLabel="Keep editing"
                variant="danger"
            />
        </>
    );
};
