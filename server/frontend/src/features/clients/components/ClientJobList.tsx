import { BackupJob } from '@pbcm/shared';
import { BaseJobList } from '../../jobs/components/BaseJobList';

interface ClientJobListProps {
    jobs: BackupJob[];
    onEditJob: (job: BackupJob) => void;
    onTriggerJob: (jobId: string) => void;
    onDeleteJob: (jobId: string) => void;
    onCreateJob: () => void;
}

export const ClientJobList = ({ jobs, onEditJob, onTriggerJob, onDeleteJob, onCreateJob }: ClientJobListProps) => {
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
            viewModeStorageKey="jobViewMode"
        />
    );
};
