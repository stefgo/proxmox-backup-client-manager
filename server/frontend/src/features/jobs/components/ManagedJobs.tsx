import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CLIENT_STATUS } from '@pbcm/shared';
import { useConfirm, useToast } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { useGlobalJobsStore } from '../../../stores/useGlobalJobsStore';
import { useClientStore } from '../../../stores/useClientStore';
import { JobList } from './JobList';
import { ClientHistoryList } from '../../clients/components/ClientHistoryList';
import { GlobalJob, jobIdOf } from '../../../stores/useGlobalJobsStore';
import { useGlobalSubscription } from '../../../hooks/useGlobalSubscription';
import { getErrorMessage } from '../../../utils';
import { describeDeleteJob } from '../confirmations';
import { api } from '../../../lib/api';
import { markJobRunAsked, forgetJobRunAsked } from '../../../hooks/useJobResultToasts';

export const ManagedJobs = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const { globalJobs, latestPerJob, fetchAllJobs, isLoading, error } =
        useGlobalJobsStore();
    const { clients, fetchClients } = useClientStore();
    const { confirm } = useConfirm();
    const { show } = useToast();

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchAllJobs();
        // Read the store through getState() rather than the subscribed value:
        // this only fills it if it is still empty, and depending on its
        // contents would re-run fetchAllJobs the moment they arrive.
        if (useClientStore.getState().clients.length === 0) fetchClients();
    }, [isAuthenticated, fetchAllJobs, fetchClients]);

    useGlobalSubscription();

    /**
     * Leaves out the rows of deleted jobs -- as far as that can be told. The server knows a
     * client's jobs only while it is connected and reports an empty list once it drops, so
     * "not in the list" means deleted only for an online client whose list has arrived. An
     * offline client keeps its rows, and so does an online one whose list is still empty.
     */
    const latestOfExistingJobs = useMemo(() => {
        const jobsByClient = new Map<string, Set<string>>();
        for (const job of globalJobs) {
            if (!job.id) continue;
            const ids = jobsByClient.get(job.clientId) ?? new Set<string>();
            ids.add(job.id);
            jobsByClient.set(job.clientId, ids);
        }
        const onlineClients = new Set(
            clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).map((c) => c.id),
        );
        return latestPerJob.filter((row) => {
            const jobs = jobsByClient.get(row.clientId);
            if (!jobs || !onlineClients.has(row.clientId)) return true;
            const jobId = jobIdOf(row);
            return jobId !== null && jobs.has(jobId);
        });
    }, [latestPerJob, globalJobs, clients]);

    const handleRefresh = () => {
        fetchAllJobs();
    };

    const handleTriggerJob = async (clientId: string, jobId: string) => {
        // Before the request: a run that is skipped at once can report before it returns.
        markJobRunAsked(clientId, jobId);
        try {
            await api.post(`/api/v1/clients/${clientId}/jobs/${jobId}/run`, undefined, undefined, {
                fallback: 'Failed to trigger job',
            });
            show({ variant: 'success', title: 'Job started' });
        } catch (e: unknown) {
            forgetJobRunAsked(clientId, jobId);
            show({ variant: 'error', title: 'Could not start the job', description: getErrorMessage(e) });
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
        confirm({
            ...describeDeleteJob(job.name, getClientName(job.clientId)),
            onConfirm: async () => {
                await api.delete(`/api/v1/clients/${job.clientId}/jobs/${job.id}`, {
                    fallback: 'Failed to delete job',
                });
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
        navigate(job ? `/jobs/${job.clientId}/${job.id}` : '/jobs/new', {
            state: { from: '/jobs' },
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
                    title="Last Activity"
                    history={latestOfExistingJobs}
                    showClientName={true}
                    emptyMessage="No job has run yet."
                />
            </div>
        </div>
    );
};
