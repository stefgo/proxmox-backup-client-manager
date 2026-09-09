import { ClientStatus } from "@pbcm/shared";
import { GlobalJob } from "../../../stores/useGlobalJobsStore";
import { BaseJobList } from "./BaseJobList";

interface JobListProps {
    jobs: GlobalJob[];
    onEditJob: (job: GlobalJob) => void;
    onCreateJob: () => void;
    onTriggerJob: (clientId: string, jobId: string) => void;
    onDeleteJob: (clientId: string, jobId: string) => void;
    getClientStatus: (clientId: string) => ClientStatus;
    getClientName: (clientId: string) => string;
}

export const JobList = ({
    jobs,
    onEditJob,
    onCreateJob,
    onTriggerJob,
    onDeleteJob,
    getClientStatus,
    getClientName,
}: JobListProps) => {
    return (
        <BaseJobList
            jobs={jobs}
            title="Jobs"
            showClientColumn={true}
            showNewJobButton={true}
            onEditJob={onEditJob}
            onCreateJob={onCreateJob}
            onTriggerJob={(job) => {
                if (job.clientId && job.id) onTriggerJob(job.clientId, job.id);
            }}
            onDeleteJob={(job) => {
                if (job.clientId && job.id) onDeleteJob(job.clientId, job.id);
            }}
            getClientStatus={getClientStatus}
            getClientName={getClientName}
            viewModeStorageKey="globalJobViewMode"
        />
    );
};
