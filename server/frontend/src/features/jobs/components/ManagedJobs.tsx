import { useEffect, useState, useRef } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useGlobalJobsStore } from "../../../stores/useGlobalJobsStore";
import { useClientStore } from "../../../stores/useClientStore";
import { JobList } from "./JobList";
import { ClientHistoryList } from "../../clients/components/ClientHistoryList";
import { ClientJobEditor } from "../../clients/components/ClientJobEditor";
import { useJobForm } from "../../clients/hooks/useJobForm";
import { useRepositoryStore } from "../../../stores/useRepositoryStore";
import { useClientFileSystemStore } from "../../../stores/useClientFileSystemStore";
import { GlobalJob } from "../../../stores/useGlobalJobsStore";
import { useGlobalSubscription } from "../../../hooks/useGlobalSubscription";
import { getErrorMessage } from "../../../utils";
import { apiFetch } from "../../../lib/apiFetch";

export const ManagedJobs = () => {
    const { token } = useAuth();
    const { globalJobs, lastHistory, fetchAllJobs, isLoading, error } =
        useGlobalJobsStore();
    const { clients, fetchClients } = useClientStore();
    // Only the action: the repository list itself is read through getState() below,
    // so this view no longer re-renders on every repository status change.
    const fetchRepositories = useRepositoryStore((s) => s.fetchRepositories);

    const [isEditing, setIsEditing] = useState(false);
    const [editingJob, setEditingJob] = useState<GlobalJob | null>(null);

    useEffect(() => {
        if (!token) return;
        fetchAllJobs();
        // Read the two stores through getState() rather than the subscribed values:
        // this only fills them if they are still empty, and depending on their
        // contents would re-run fetchAllJobs the moment they arrive.
        if (useClientStore.getState().clients.length === 0) fetchClients();
        if (useRepositoryStore.getState().repositories.length === 0) {
            fetchRepositories();
        }
    }, [token, fetchAllJobs, fetchClients, fetchRepositories]);

    useGlobalSubscription();

    const handleRefresh = () => {
        if (token) fetchAllJobs();
    };

    const handleTriggerJob = async (clientId: string, jobId: string) => {
        if (!token) return;
        try {
            const res = await apiFetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}/run`,
                {
                    method: "POST",
                },
            );
            if (!res.ok) throw new Error("Failed to trigger job");
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        }
    };

    const handleDeleteJob = async (clientId: string, jobId: string) => {
        if (!token) return;
        try {
            const res = await apiFetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}`,
                {
                    method: "DELETE",
                },
            );
            if (!res.ok) throw new Error("Failed to delete job");
            handleRefresh();
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        }
    };

    const getClientStatus = (clientId: string) => {
        const client = clients.find((c) => c.id === clientId);
        return client?.status || "offline";
    };

    const getClientName = (clientId: string) => {
        const client = clients.find((c) => c.id === clientId);
        return client?.displayName || client?.hostname || clientId;
    };

    const handleEditJob = (job: GlobalJob) => {
        setEditingJob(job);
        // We need to bypass the standard startEditJob of useJobForm because it assumes a fixed clientId.
        // Or we just re-mount the form when a job is selected.
        setIsEditing(true);
    };

    if (isLoading && globalJobs.length === 0) {
        return (
            <div className="p-8 text-center text-text-muted">Loading jobs...</div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-error">Error: {error}</div>
        );
    }

    if (isEditing && editingJob) {
        // Render a dedicated JobEditor per selected job so the hook gets the right clientId on mount
        return (
            <JobsEditorWrapper
                job={editingJob}
                onCancel={() => setIsEditing(false)}
                onSaveSuccess={() => {
                    setIsEditing(false);
                    setEditingJob(null);
                    handleRefresh();
                }}
            />
        );
    }

    return (
        <div className="space-y-6 flex flex-col">
            <div>
                <JobList
                    jobs={globalJobs}
                    onEditJob={handleEditJob}
                    onTriggerJob={handleTriggerJob}
                    onDeleteJob={handleDeleteJob}
                    getClientStatus={getClientStatus}
                    getClientName={getClientName}
                />
            </div>

            <div className="mt-6">
                <ClientHistoryList
                    title="Last History"
                    history={lastHistory}
                    showClientName={true}
                    emptyMessage="No data available in the observation period."
                />
            </div>
        </div>
    );
};

// Wrapper component to isolate the useJobForm hook with the specific clientId
const JobsEditorWrapper = ({
    job,
    onCancel,
    onSaveSuccess,
}: {
    job: GlobalJob;
    onCancel: () => void;
    onSaveSuccess: () => void;
}) => {
    const { token } = useAuth();
    const { repositories } = useRepositoryStore();
    const { fileList, isLoadingFiles, fetchFileList } =
        useClientFileSystemStore();

    const jobForm = useJobForm({
        clientId: job.clientId,
        onSaveSuccess: onSaveSuccess,
    });

    // Seeds the form from the selected job exactly once. Neither jobForm nor
    // startEditJob keeps its identity across renders, so there is no honest
    // dependency array to write here -- the guard does the job instead.
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current) return;
        seeded.current = true;
        jobForm.startEditJob(job);
    });

    useEffect(() => {
        if (token && job.clientId) {
            fetchFileList(job.clientId, jobForm.fileBrowserPath);
        }
    }, [jobForm.fileBrowserPath, token, job.clientId, fetchFileList]);

    // JobFormContextType types this prop as (val: boolean) => void, so the
    // updater form was unreachable through it.
    const customSetIsCreatingJob = (val: boolean) => {
        jobForm.setIsCreatingJob(val);
        if (!val) onCancel();
    };

    return (
        <ClientJobEditor
            {...jobForm}
            setIsCreatingJob={customSetIsCreatingJob}
            repositories={repositories}
            fileList={fileList}
            isLoadingFiles={isLoadingFiles}
        />
    );
};
