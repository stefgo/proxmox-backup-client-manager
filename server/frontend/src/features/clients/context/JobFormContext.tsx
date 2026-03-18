import { createContext, useContext } from 'react';
import { Archive, Repository as JobRepository } from '@pbcm/shared';
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
    scheduleUnit: string;
    setScheduleUnit: (val: string) => void;
    scheduleWeekdays: string[];
    setScheduleWeekdays: (days: string[]) => void;
    scheduleStartDate: string;
    setScheduleStartDate: (val: string) => void;
    scheduleStartTime: string;
    setScheduleStartTime: (val: string) => void;

    saveBackupJob: () => void;

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
