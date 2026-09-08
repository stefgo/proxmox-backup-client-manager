import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CLIENT_STATUS } from "@pbcm/shared";
import { useAuth } from "../../auth/AuthContext";
import { useGlobalJobsStore } from "../../../stores/useGlobalJobsStore";
import { useClientStore } from "../../../stores/useClientStore";
import { JobList } from "./JobList";
import { ClientHistoryList } from "../../clients/components/ClientHistoryList";
import { useRepositoryStore } from "../../../stores/useRepositoryStore";
import { GlobalJob } from "../../../stores/useGlobalJobsStore";
import { useGlobalSubscription } from "../../../hooks/useGlobalSubscription";
import { getErrorMessage } from "../../../utils";
import { apiFetch } from "../../../lib/apiFetch";

export const ManagedJobs = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const { globalJobs, lastHistory, fetchAllJobs, isLoading, error } =
        useGlobalJobsStore();
    const { clients, fetchClients } = useClientStore();
    // Only the action: the repository list itself is read through getState() below,
    // so this view no longer re-renders on every repository status change.
    const fetchRepositories = useRepositoryStore((s) => s.fetchRepositories);

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
        return client?.status || CLIENT_STATUS.OFFLINE;
    };

    const getClientName = (clientId: string) => {
        const client = clients.find((c) => c.id === clientId);
        return client?.displayName || client?.hostname || clientId;
    };

    /**
     * The editor is a page of its own. Under `/jobs` rather than under the client, so the
     * sidebar keeps marking the list this was opened from -- the client is carried in the
     * path because the job is saved through its client's endpoint.
     */
    const openJobEditor = (job?: GlobalJob) => {
        navigate(job ? `/jobs/${job.clientId}/${job.id}` : "/jobs/new", {
            state: { from: "/jobs" },
        });
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

    return (
        <div className="space-y-6 flex flex-col">
            <div>
                <JobList
                    jobs={globalJobs}
                    onEditJob={openJobEditor}
                    onCreateJob={() => openJobEditor()}
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
