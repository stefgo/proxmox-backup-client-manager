import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CLIENT_STATUS } from "@pbcm/shared";
import { useConfirm } from "@stefgo/react-ui-components";
import { useAuth } from "../../auth/AuthContext";
import { useGlobalJobsStore } from "../../../stores/useGlobalJobsStore";
import { useClientStore } from "../../../stores/useClientStore";
import { JobList } from "./JobList";
import { ClientHistoryList } from "../../clients/components/ClientHistoryList";
import { useRepositoryStore } from "../../../stores/useRepositoryStore";
import { GlobalJob, LAST_HISTORY_HOURS } from "../../../stores/useGlobalJobsStore";
import { useGlobalSubscription } from "../../../hooks/useGlobalSubscription";
import { describeFailure } from "../../../utils";
import { describeDeleteJob } from "../confirmations";
import { apiFetch } from "../../../lib/apiFetch";

export const ManagedJobs = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const { globalJobs, lastHistory, fetchAllJobs, isLoading, error } =
        useGlobalJobsStore();
    const { clients, fetchClients } = useClientStore();
    const { confirm, alert } = useConfirm();
    // Only the action: the repository list itself is read through getState() below,
    // so this view no longer re-renders on every repository status change.
    const fetchRepositories = useRepositoryStore((s) => s.fetchRepositories);

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchAllJobs();
        // Read the two stores through getState() rather than the subscribed values:
        // this only fills them if they are still empty, and depending on their
        // contents would re-run fetchAllJobs the moment they arrive.
        if (useClientStore.getState().clients.length === 0) fetchClients();
        if (useRepositoryStore.getState().repositories.length === 0) {
            fetchRepositories();
        }
    }, [isAuthenticated, fetchAllJobs, fetchClients, fetchRepositories]);

    useGlobalSubscription();

    const handleRefresh = () => {
        if (isAuthenticated) fetchAllJobs();
    };

    const handleTriggerJob = async (clientId: string, jobId: string) => {
        if (!isAuthenticated) return;
        try {
            const res = await apiFetch(
                `/api/v1/clients/${clientId}/jobs/${jobId}/run`,
                {
                    method: "POST",
                },
            );
            if (!res.ok) throw new Error("Failed to trigger job");
        } catch (e: unknown) {
            alert(describeFailure("Could not start the job", e));
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

    // The dialog stays open on failure, so the retry is one click away.
    const requestDeleteJob = (job: GlobalJob) => {
        if (!isAuthenticated) return;
        confirm({
            ...describeDeleteJob(job.name, getClientName(job.clientId)),
            onConfirm: async () => {
                const res = await apiFetch(`/api/v1/clients/${job.clientId}/jobs/${job.id}`, {
                    method: "DELETE",
                });
                if (!res.ok) throw new Error("Failed to delete job");
                handleRefresh();
            },
        });
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
                    onDeleteJob={(clientId, jobId) => {
                        const job = globalJobs.find(
                            (j) => j.clientId === clientId && j.id === jobId,
                        );
                        if (job) requestDeleteJob(job);
                    }}
                    getClientStatus={getClientStatus}
                    getClientName={getClientName}
                />
            </div>

            <div className="mt-6">
                <ClientHistoryList
                    title={`Last History (${LAST_HISTORY_HOURS}h)`}
                    history={lastHistory}
                    showClientName={true}
                    emptyMessage={`No runs in the last ${LAST_HISTORY_HOURS} hours.`}
                />
            </div>
        </div>
    );
};
