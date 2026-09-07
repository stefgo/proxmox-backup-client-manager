import { X } from 'lucide-react';
import { JobScheduleSettings } from './job-editor/JobScheduleSettings';
import { JobRepositorySelect } from './job-editor/JobRepositorySelect';
import { JobArchiveEditor } from './job-editor/JobArchiveEditor';
import { JobArchiveList } from './job-editor/JobArchiveList';
import { JobEncryptionSettings } from './job-editor/JobEncryptionSettings';
import { JobTunnelSettings } from './job-editor/JobTunnelSettings';
import { JobFormProvider, JobFormContextType } from '../context/JobFormContext';
import { Card, Button, Input, ActionButton } from '@stefgo/react-ui-components';

// ClientJobEditor now accepts the form state and provides it via context
// It implements the "Compound Component" pattern by using Context
export const ClientJobEditor = (props: JobFormContextType) => {

    const {
        isCreatingJob,
        setIsCreatingJob,
        editingJobId,
        newJobName,
        setNewJobName,
        jobArchives,
        jobRepository,
        isAddingArchive,
        isSelectingRepository,
        setIsSelectingRepository,
        repositories,
        setJobRepository,
        saveBackupJob,
    } = props;

    if (!isCreatingJob) return null;

    return (
        <JobFormProvider value={props}>
            <Card
                className="flex flex-col"
                title={editingJobId ? 'Edit Job' : 'New Backup Job'}
                action={
                    <ActionButton icon={X} tooltip="Close" onClick={() => setIsCreatingJob(false)} />
                }
                classNames={{
                    header: "py-6 px-7",
                    headerTitle: "text-xl font-bold"
                }}
            >

                <div className="p-7 bg-card flex-1 overflow-hidden flex flex-col gap-6">
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
                </div>

                {/* Footer */}
                <div className="p-6 bg-card flex justify-end gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => setIsCreatingJob(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={saveBackupJob}
                        disabled={!newJobName || !jobRepository || jobArchives.length === 0}
                        className="shadow-glow-accent"
                    >
                        Save Job
                    </Button>
                </div>
            </Card >
        </JobFormProvider>
    );
};
