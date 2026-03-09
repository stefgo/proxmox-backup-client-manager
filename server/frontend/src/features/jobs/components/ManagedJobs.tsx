import { useEffect, useState } from "react";
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

export const ManagedJobs = () => {
    const { token } = useAuth();
    const { globalJobs, lastHistory, fetchAllJobs, isLoading, error } =
        useGlobalJobsStore();
    const { clients, fetchClients } = useClientStore();
    const { repositories, fetchRepositories } = useRepositoryStore();

    const [isEditing, setIsEditing] = useState(false);
    const [editingJob, setEditingJob] = useState<GlobalJob | null>(null);

    useEffect(() => {
        if (token) {
            fetchAllJobs(token);
            if (clients.length === 0) fetchClients(token);
            if (repositories.length === 0) fetchRepositories(token);
        }
    }, [token]);

    useGlobalSubscription();

    const handleRefresh = () => {
        if (token) fetchAllJobs(token);
    };

    const handleTriggerJob = async (clientId: string, jobId: string) => {
        if (!token) return;
        try {
            const res = await fetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}/run`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
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
            const res = await fetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
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
            <div className="p-8 text-center text-gray-500">Loading jobs...</div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">Error: {error}</div>
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

    useEffect(() => {
        jobForm.startEditJob(job);
    }, []); // Run once on mount

    useEffect(() => {
        if (token && job.clientId) {
            fetchFileList(job.clientId, jobForm.fileBrowserPath, token);
        }
    }, [jobForm.fileBrowserPath, token]);

    const customSetIsCreatingJob = (
        val: boolean | ((prevState: boolean) => boolean),
    ) => {
        const newValue =
            typeof val === "function" ? val(jobForm.isCreatingJob) : val;
        jobForm.setIsCreatingJob(newValue);
        if (!newValue) onCancel();
    };

    return (
        <ClientJobEditor
            {...jobForm}
            setIsCreatingJob={customSetIsCreatingJob as any}
            repositories={repositories}
            fileList={fileList}
            isLoadingFiles={isLoadingFiles}
        />
    );
};
