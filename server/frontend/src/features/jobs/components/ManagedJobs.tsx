import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoadingIndicator } from '@stefgo/react-ui-components';
import { useGlobalJobs, useLatestPerJob } from '../../../queries/jobs';
import { useClients } from '../../../queries/clients';
import { JobList } from './JobList';
import type { GlobalJob } from '../../../lib/cacheUpdates';
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

    // The same cache entry the dashboard's "Backup status" reads, so the two cannot disagree.
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
    );
};
