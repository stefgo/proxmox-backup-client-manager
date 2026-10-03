import { Unplug } from 'lucide-react';
import { BackupJob } from '@pbcm/shared';
import { EmptyState } from '@stefgo/react-ui-components';
import { BaseJobList } from '../../jobs/components/BaseJobList';
import type { LastRun } from '../../jobs/lib/lastRun';

interface ClientJobListProps {
    jobs: BackupJob[];
    onEditJob: (job: BackupJob) => void;
    onTriggerJob: (jobId: string) => void;
    onDeleteJob: (jobId: string) => void;
    onCreateJob: () => void;
    getLastRun: (job: BackupJob) => LastRun | undefined;
    /** The client these jobs are on. Forwarded to the list underneath -- see BaseJobListProps. */
    clientId: string;
    /**
     * The client is not connected. Its jobs live on the agent, so the server has none to
     * show -- which the list says, instead of offering to create the first one.
     */
    offline?: boolean;
    /** Forwarded to the list underneath -- see BaseJobListProps. */
    searchParamKey?: string;
}

export const ClientJobList = ({ jobs, onEditJob, onTriggerJob, onDeleteJob, onCreateJob, getLastRun, clientId, offline = false, searchParamKey }: ClientJobListProps) => {
    return (
        <BaseJobList
            jobs={jobs}
            title="Jobs"
            showClientColumn={false}
            showNewJobButton={!offline}
            onEditJob={onEditJob}
            onTriggerJob={(job) => { if (job.id) onTriggerJob(job.id); }}
            onDeleteJob={(job) => { if (job.id) onDeleteJob(job.id); }}
            onCreateJob={onCreateJob}
            getLastRun={getLastRun}
            clientId={clientId}
            emptyMessage={
                offline ? (
                    <EmptyState
                        icon={Unplug}
                        title="The client is offline"
                        description="Jobs are stored on the agent. They appear here once the client is online."
                    />
                ) : undefined
            }
            viewModePersistKey="jobViewMode"
            searchParamKey={searchParamKey}
        />
    );
};
