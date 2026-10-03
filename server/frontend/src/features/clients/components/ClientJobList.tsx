import { BackupJob } from '@pbcm/shared';
import { BaseJobList } from '../../jobs/components/BaseJobList';
import type { LastRun } from '../../jobs/lib/lastRun';

interface ClientJobListProps {
    jobs: BackupJob[];
    onEditJob: (job: BackupJob) => void;
    onTriggerJob: (jobId: string) => void;
    onDeleteJob: (jobId: string) => void;
    onCreateJob: () => void;
    getLastRun: (job: BackupJob) => LastRun | undefined;
    /** Forwarded to the list underneath -- see BaseJobListProps. */
    searchParamKey?: string;
}

export const ClientJobList = ({ jobs, onEditJob, onTriggerJob, onDeleteJob, onCreateJob, getLastRun, searchParamKey }: ClientJobListProps) => {
    return (
        <BaseJobList
            jobs={jobs}
            title="Jobs"
            showClientColumn={false}
            showNewJobButton={true}
            onEditJob={onEditJob}
            onTriggerJob={(job) => { if (job.id) onTriggerJob(job.id); }}
            onDeleteJob={(job) => { if (job.id) onDeleteJob(job.id); }}
            onCreateJob={onCreateJob}
            getLastRun={getLastRun}
            viewModePersistKey="jobViewMode"
            searchParamKey={searchParamKey}
        />
    );
};
