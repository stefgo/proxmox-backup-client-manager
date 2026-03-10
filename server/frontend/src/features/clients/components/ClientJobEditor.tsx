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
            <div className="bg-app-light dark:bg-app-dark rounded-xl border border-gray-200 dark:border-[#333] shadow-lg flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525] rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingJobId ? 'Edit Job' : 'New Backup Job'}</h3>
                    <button onClick={() => setIsCreatingJob(false)} className="text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
                </div>

                <div className="p-6 flex-1 overflow-hidden flex flex-col gap-4">
                    {editingJobId && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">ID</label>
                            <div className="bg-gray-100 dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-500 dark:text-[#666] font-mono text-sm">
                                {editingJobId}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Name <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={newJobName}
                            onChange={(e) => setNewJobName(e.target.value)}
                            placeholder="e.g. Production System"
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none"
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
                <div className="p-4 border-t border-gray-200 dark:border-[#333] flex justify-end gap-3 bg-gray-50 dark:bg-[#252525]">
                    <button onClick={() => setIsCreatingJob(false)} className="px-4 py-2 rounded bg-gray-200 dark:bg-[#333] hover:bg-gray-300 dark:hover:bg-[#444] text-gray-800 dark:text-white font-medium">
                        Cancel
                    </button>
                    <button
                        onClick={saveBackupJob}
                        disabled={!newJobName || !jobRepository || jobArchives.length === 0}
                        className="px-4 py-2 rounded bg-app-accent hover:bg-[#ff5f1f] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2"
                    >
                        Save Job
                    </button>
                </div>
            </div >
        </JobFormProvider>
    );
};

