import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CLIENT_STATUS } from '@pbcm/shared';
import { useConfirm, useToast } from '@stefgo/react-ui-components';
import { useDeleteJob, useGlobalJobs, useLatestPerJob, useTriggerJob } from '../../../queries/jobs';
import { useClients } from '../../../queries/clients';
import { JobList } from './JobList';
import { ClientHistoryList } from '../../clients/components/ClientHistoryList';
import { jobIdOf, type GlobalJob } from '../../../lib/cacheUpdates';
import { getErrorMessage } from '../../../utils';
import { describeDeleteJob } from '../confirmations';
import { ROUTES, paths } from '../../../lib/paths';

export const ManagedJobs = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const { jobs: globalJobs, isPending, error: jobsError } = useGlobalJobs();
    const { latestPerJob, error: latestError } = useLatestPerJob();
    const error = jobsError ?? latestError;
    const { mutateAsync: triggerJob } = useTriggerJob();
    const { mutateAsync: deleteJob } = useDeleteJob();
    const { clients } = useClients();
    const { confirm } = useConfirm();
    const { show } = useToast();

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

    const handleTriggerJob = async (clientId: string, jobId: string) => {
        try {
            await triggerJob({ clientId, jobId });
            show({ variant: 'success', title: 'Job started' });
        } catch (e: unknown) {
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
        if (!job.id) return;
        const jobId = job.id;
        confirm({
            ...describeDeleteJob(job.name, getClientName(job.clientId)),
            onConfirm: () => deleteJob({ clientId: job.clientId, jobId }),
        });
    };

    /**
     * The editor is a page of its own. Under `/jobs` rather than under the client, so the
     * sidebar keeps marking the list this was opened from -- the client is carried in the
     * path because the job is saved through its client's endpoint. The query goes along,
     * so the editor closes onto this list as it was searched.
     */
    const openJobEditor = (job?: GlobalJob) => {
        navigate({ pathname: job?.id ? paths.job(job.clientId, job.id) : ROUTES.jobNew, search });
    };

    if (isPending) {
        return (
            <div className="p-8 text-center text-text-muted">Loading jobs...</div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-error">Error: {getErrorMessage(error)}</div>
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
