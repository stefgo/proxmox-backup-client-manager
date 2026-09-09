import { createContext, useContext } from 'react';
import { Archive, Repository as JobRepository, ScheduleConfig } from '@pbcm/shared';
import { FsFile } from '@stefgo/react-ui-components';
import { ManagedRepository as Repository } from '@pbcm/shared';

// Define the shape of the context based on ClientJobEditor props (which come from useJobForm + extras)
export interface JobFormContextType {
    isCreatingJob: boolean;
    setIsCreatingJob: (val: boolean) => void;
    editingJobId: string | null;
    newJobName: string;
    setNewJobName: (val: string) => void;
    jobArchives: Archive[];
    setJobArchives: (archives: Archive[]) => void;
    isAddingArchive: boolean;
    setIsAddingArchive: (val: boolean) => void;
    editingArchiveIndex: number | null;
    setEditingArchiveIndex: (val: number | null) => void;

    // File Browser
    fileBrowserPath: string;
    setFileBrowserPath: (path: string) => void;
    fileList: FsFile[];
    isLoadingFiles: boolean;
    newItemName: string;
    setNewItemName: (name: string) => void;
    newItemPath: string;
    setNewItemPath: (path: string) => void;
    // parentPath: (path: string) => string; // Can be utility
    selectPath: (path: string) => void;
    addArchiveItem: () => void;
    handleEditArchiveItem: (index: number) => void;

    // Schedule
    scheduleEnabled: boolean;
    setScheduleEnabled: (val: boolean) => void;
    scheduleInterval: number;
    setScheduleInterval: (val: number) => void;
    scheduleUnit: ScheduleConfig['unit'];
    setScheduleUnit: (val: ScheduleConfig['unit']) => void;
    scheduleWeekdays: string[];
    setScheduleWeekdays: (days: string[]) => void;
    scheduleStartDate: string;
    setScheduleStartDate: (val: string) => void;
    scheduleStartTime: string;
    setScheduleStartTime: (val: string) => void;

    saveBackupJob: () => void;
    /** True while the save request is in flight. */
    isSaving: boolean;
    /** Why the last save failed, shown in the editor's footer. */
    saveError: string | null;
    /** True while what is on screen is what was last stored. */
    saved: boolean;
    /** Whether anything was changed since the form was seeded or last saved. */
    isDirty: boolean;
    /** Whether the job is complete enough and changed enough to be worth saving. */
    canSaveJob: boolean;

    // Repos
    repositories: Repository[];
    jobRepository: JobRepository | null;
    setJobRepository: (repo: JobRepository | null) => void;
    isSelectingRepository: boolean;
    setIsSelectingRepository: (val: boolean) => void;

    // Encryption
    encryptionEnabled: boolean;
    setEncryptionEnabled: (val: boolean) => void;
    encryptionKeyContent: string | null;
    setEncryptionKeyContent: (val: string | null) => void;
    generateKey: () => Promise<boolean>;

    // Tunnel
    /** Whether this job reaches its repository through the client's SSH reverse tunnel. */
    tunnelRequired: boolean;
    setTunnelRequired: (val: boolean) => void;
    /** Whether the client has SSH credentials at all — without them there is no choice. */
    tunnelAvailable: boolean;
}

const JobFormContext = createContext<JobFormContextType | null>(null);

export const useJobFormContext = () => {
    const context = useContext(JobFormContext);
    if (!context) {
        throw new Error('useJobFormContext must be used within a JobFormProvider');
    }
    return context;
};

export const JobFormProvider = JobFormContext.Provider;
