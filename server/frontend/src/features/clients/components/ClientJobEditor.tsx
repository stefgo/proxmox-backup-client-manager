import { X } from 'lucide-react';
import { JobScheduleSettings } from './job-editor/JobScheduleSettings';
import { JobRepositorySelect } from './job-editor/JobRepositorySelect';
import { JobArchiveEditor } from './job-editor/JobArchiveEditor';
import { JobArchiveList } from './job-editor/JobArchiveList';
import { JobEncryptionSettings } from './job-editor/JobEncryptionSettings';
import { JobFormProvider, JobFormContextType } from '../context/JobFormContext';
import { Card, Button, Input } from '@stefgo/react-ui-components';

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
                    <button onClick={() => setIsCreatingJob(false)} className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-full hover:bg-hover dark:hover:bg-hover-dark">
                        <X size={20} />
                    </button>
                }
                classNames={{
                    header: "py-6 px-7",
                    headerTitle: "text-xl font-bold"
                }}
            >

                <div className="p-7 bg-card dark:bg-card-dark flex-1 overflow-hidden flex flex-col gap-6">
                    {editingJobId && (
                        <div>
                            <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase mb-1.5 ml-1">ID</label>
                            <div className="bg-hover dark:bg-card-dark border dark:border-border-dark rounded-lg px-3 py-2.5 text-text-muted dark:text-text-muted-dark opacity-60 font-mono text-sm">
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
                            input: "bg-app-bg dark:bg-card-dark border-border dark:border-border-dark"
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
                                <JobScheduleSettings />
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-card dark:bg-card-dark flex justify-end gap-3">
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
