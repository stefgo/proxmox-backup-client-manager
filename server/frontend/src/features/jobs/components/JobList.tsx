import { GlobalJob } from "../../../stores/useGlobalJobsStore";
import { BaseJobList } from "./BaseJobList";

interface JobListProps {
    jobs: GlobalJob[];
    onEditJob: (job: GlobalJob) => void;
    onTriggerJob: (clientId: string, jobId: string) => void;
    onDeleteJob: (clientId: string, jobId: string) => void;
    getClientStatus: (clientId: string) => "online" | "offline";
    getClientName: (clientId: string) => string;
}

export const JobList = ({
    jobs,
    onEditJob,
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
            showNewJobButton={false}
            onEditJob={onEditJob}
            onTriggerJob={(job) => {
                if (job.clientId) onTriggerJob(job.clientId, job.id);
            }}
            onDeleteJob={(job) => {
                if (job.clientId) onDeleteJob(job.clientId, job.id);
            }}
            getClientStatus={getClientStatus}
            getClientName={getClientName}
            viewModeStorageKey="globalJobViewMode"
        />
    );
};
