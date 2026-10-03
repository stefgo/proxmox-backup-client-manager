import { createContext, useContext } from 'react';
import type { EntityForm } from '../../../hooks/useEntityForm';
import type { BackupJobInput, JobDraft } from '../lib/jobForm';

/** What the job editor's panels read: the draft, and the client it is for. */
export interface JobFormContextType {
    form: EntityForm<JobDraft, BackupJobInput>;
    /** The client the job runs on; `null` until one is chosen. The file browser lists its directories. */
    clientId: string | null;
    /** The IANA zone the agent repeats the schedule in; `null` until it has reported one. */
    agentTimezone: string | null;
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
