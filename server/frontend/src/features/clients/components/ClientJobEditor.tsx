import { X } from 'lucide-react';
import { JobScheduleSettings } from './job-editor/JobScheduleSettings';
import { JobRepositorySelect } from './job-editor/JobRepositorySelect';
import { JobArchiveEditor } from './job-editor/JobArchiveEditor';
import { JobArchiveList } from './job-editor/JobArchiveList';
import { JobEncryptionSettings } from './job-editor/JobEncryptionSettings';
import { JobFormProvider, JobFormContextType } from '../context/JobFormContext';

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
            <div className="bg-app-card rounded-xl border border-gray-200 dark:border-app-border shadow-premium flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-app-border flex justify-between items-center bg-gray-50 dark:bg-app-input rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-app-text-main">{editingJobId ? 'Edit Job' : 'New Backup Job'}</h3>
                    <button onClick={() => setIsCreatingJob(false)} className="text-gray-500 dark:text-app-text-muted hover:text-gray-900 dark:hover:text-app-text-main transition-colors"><X size={20} /></button>
                </div>

                <div className="p-6 flex-1 overflow-hidden flex flex-col gap-4">
                    {editingJobId && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">ID</label>
                            <div className="bg-gray-100 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-500 dark:text-app-text-footer font-mono text-sm">
                                {editingJobId}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Name <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={newJobName}
                            onChange={(e) => setNewJobName(e.target.value)}
                            placeholder="e.g. Production System"
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                        />
                    </div>

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
                        <>
                            <JobArchiveList />
                            <JobEncryptionSettings />
                            <JobScheduleSettings />
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-app-border flex justify-end gap-3 bg-gray-50 dark:bg-app-input">
                    <button onClick={() => setIsCreatingJob(false)} className="px-4 py-2 rounded bg-gray-200 dark:bg-app-input hover:bg-gray-300 dark:hover:bg-app-card text-gray-800 dark:text-app-text-main font-medium transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={saveBackupJob}
                        disabled={!newJobName || !jobRepository || jobArchives.length === 0}
                        className="px-4 py-2 rounded bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2 transition-all shadow-glow-accent"
                    >
                        Save Job
                    </button>
                </div>
            </div >
        </JobFormProvider>
    );
};

