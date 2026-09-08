import { ReactNode } from 'react';
import { Save, X } from 'lucide-react';
import { JobScheduleSettings } from './job-editor/JobScheduleSettings';
import { JobRepositorySelect } from './job-editor/JobRepositorySelect';
import { JobArchiveEditor } from './job-editor/JobArchiveEditor';
import { JobArchiveList } from './job-editor/JobArchiveList';
import { JobEncryptionSettings } from './job-editor/JobEncryptionSettings';
import { JobTunnelSettings } from './job-editor/JobTunnelSettings';
import { JobFormProvider, JobFormContextType } from '../context/JobFormContext';
import { Card, Button, Input, ActionButton } from '@stefgo/react-ui-components';

export interface ClientJobEditorProps extends JobFormContextType {
    /**
     * The client this job runs on, rendered above the repository in the same shape.
     * Left out where the surface has no choice to offer.
     */
    clientField?: ReactNode;
    /** While the client list is open it replaces the form, exactly as the repository list does. */
    isSelectingClient?: boolean;
    /** Whether a client is set at all — without one there is no endpoint to save to. */
    hasClient?: boolean;
    /** What the X and Cancel do. Closing is a navigation for the routed editor. */
    onClose?: () => void;
}

// ClientJobEditor now accepts the form state and provides it via context
// It implements the "Compound Component" pattern by using Context
export const ClientJobEditor = (props: ClientJobEditorProps) => {

    const {
        isCreatingJob,
        setIsCreatingJob,
        clientField,
        isSelectingClient = false,
        hasClient = true,
        onClose,
        editingJobId,
        newJobName,
        setNewJobName,
        jobRepository,
        isAddingArchive,
        isSelectingRepository,
        setIsSelectingRepository,
        repositories,
        setJobRepository,
        saveBackupJob,
        isSaving,
        saveError,
        saved,
        canSaveJob,
    } = props;

    if (!isCreatingJob) return null;

    const close = onClose ?? (() => setIsCreatingJob(false));

    return (
        <JobFormProvider value={props}>
            <Card
                className="flex flex-col"
                title={editingJobId ? 'Edit Job' : 'New Backup Job'}
                action={
                    <ActionButton icon={X} tooltip="Close" onClick={close} />
                }
                classNames={{
                    header: "py-6 px-7",
                    headerTitle: "text-xl font-bold"
                }}
            >

                <div className="p-7 bg-card flex-1 overflow-hidden flex flex-col gap-6">
                    {/* The open client list takes the panel for itself, the way the
                        repository list does — the form underneath is not answerable
                        until the client it belongs to is settled. */}
                    {isSelectingClient ? clientField : (
                        <>
                            {editingJobId && (
                                <div>
                                    <label className="block text-xs font-bold text-text-muted uppercase mb-1.5 ml-1">ID</label>
                                    <div className="bg-hover border rounded-lg px-3 py-2.5 text-text-muted opacity-60 font-mono text-sm">
                                        {editingJobId}
                                    </div>
                                </div>
                            )}

                            <Input
                                label="Name"
                                required
                                value={newJobName}
                                onChange={(e) => setNewJobName(e.target.value)}
                                placeholder="e.g. Production System"
                                classNames={{
                                    label: "mb-2",
                                    input: "bg-app-bg border-border"
                                }}
                            />

                            <div className="space-y-6">
                                {clientField}

                                <JobRepositorySelect
                                    repositories={repositories}
                                    selectedRepository={jobRepository}
                                    onSelect={setJobRepository}
                                    isSelecting={isSelectingRepository}
                                    onSetIsSelecting={setIsSelectingRepository}
                                />

                                {isSelectingRepository ? null : isAddingArchive ? (
                                    <JobArchiveEditor />
                                ) : (
                                    <div className="space-y-6">
                                        <JobArchiveList />
                                        <JobEncryptionSettings />
                                        <JobTunnelSettings />
                                        <JobScheduleSettings />
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer -- the same shape the client and repository editors use: one
                    button for the form it sits under, and the outcome beside it rather
                    than in a browser dialog. Leaving is the X in the header, which is in
                    reach from every scroll position. */}
                <div className="p-6 bg-card flex items-center justify-end gap-4 border-t border-border">
                    {saveError && <span className="text-sm text-error mr-auto">{saveError}</span>}
                    {!saveError && saved && <span className="text-sm text-success mr-auto">Job saved</span>}
                    <Button
                        variant="primary"
                        onClick={saveBackupJob}
                        isLoading={isSaving}
                        disabled={!hasClient || !canSaveJob}
                        icon={Save}
                        className="shadow-glow-accent"
                    >
                        Save Job
                    </Button>
                </div>
            </Card >
        </JobFormProvider>
    );
};
