import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CLIENT_STATUS } from '@pbcm/shared';
import { LoadingIndicator } from '@stefgo/react-ui-components';
import { useGlobalJobs, useLatestPerJob } from '../../../queries/jobs';
import { useClients } from '../../../queries/clients';
import { JobList } from './JobList';
import { ClientHistoryList } from '../../clients/components/ClientHistoryList';
import { jobIdOf, type GlobalJob } from '../../../lib/cacheUpdates';
import { QueryError } from '../../../components/QueryError';
import { useGlobalJobActions } from '../hooks/useGlobalJobActions';
import { ROUTES, paths } from '../../../lib/paths';
import { lastRunByJob, lastRunKey } from '../lib/lastRun';
import { jobListEmpty } from '../lib/jobListEmpty';

export const ManagedJobs = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const { jobs: globalJobs, isPending, error: jobsError } = useGlobalJobs();
    const { latestPerJob, error: latestError } = useLatestPerJob();
    const error = jobsError ?? latestError;
    const { clients } = useClients();
    const { getClientStatus, getClientName, triggerNow, requestDelete } = useGlobalJobActions();

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

    // The same cache entry "Last Activity" below reads, so the two cannot disagree.
    const lastRuns = useMemo(() => lastRunByJob(latestPerJob), [latestPerJob]);

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
        return <LoadingIndicator label="Loading jobs…" />;
    }

    if (error) {
        return <QueryError title="Could not load the jobs" error={error} />;
    }

    return (
        <div className="space-y-6 flex flex-col">
            <div>
                <JobList
                    jobs={globalJobs}
                    onEditJob={openJobEditor}
                    onCreateJob={() => openJobEditor()}
                    onTriggerJob={triggerNow}
                    onDeleteJob={requestDelete}
                    getClientStatus={getClientStatus}
                    getClientName={getClientName}
                    empty={jobListEmpty(clients)}
                    getLastRun={(job) => (job.id ? lastRuns.get(lastRunKey(job.clientId, job.id)) : undefined)}
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
