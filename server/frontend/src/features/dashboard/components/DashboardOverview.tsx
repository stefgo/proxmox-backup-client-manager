import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, Database, HardDrive, Monitor } from 'lucide-react';
import { JOB_STATUS } from '@pbcm/shared';
import { Card, EmptyState, LoadingIndicator, StatCard } from '@stefgo/react-ui-components';
import { useClients } from '../../../queries/clients';
import { useRepositories } from '../../../queries/repositories';
import { useGlobalJobs, useLatestPerJob } from '../../../queries/jobs';
import { useGlobalHistory } from '../../../queries/history';
import { BaseJobList } from '../../jobs/components/BaseJobList';
import { BaseHistoryList } from '../../history/components/BaseHistoryList';
import { useGlobalJobActions } from '../../jobs/hooks/useGlobalJobActions';
import { lastRunByJob, lastRunKey } from '../../jobs/lib/lastRun';
import { lastPage } from '../../history/lib/historyView';
import { QueryError } from '../../../components/QueryError';
import { PAGE_SIZE } from '../../../components/listDefaults';
import { ROUTES, paths } from '../../../lib/paths';
import type { GlobalJob } from '../../../lib/cacheUpdates';
import { activeJobCount, clientCount, formatOnlineCount, missedJobs, repositoryCount } from '../lib/dashboard';

/** How often "now" moves on. A job turns missed by the clock, with no message to say so. */
const NOW_TICK_MS = 30_000;

/**
 * The start page: what is there, and what went wrong.
 *
 * The three cards are the counts the sidebar shows as badges, each the way to its list.
 * Below them is only what needs attention -- jobs whose scheduled run did not happen, and
 * the runs that failed. Everything that went well is on the pages the cards lead to.
 *
 * Opening this page does not mark the failures as seen: the dot on "History" stays until
 * the history itself was opened, which is where a failure is read in context.
 */
export const DashboardOverview = () => {
    const navigate = useNavigate();
    const { clients, isPending: clientsPending, error: clientsError } = useClients();
    const { repositories, isPending: reposPending, error: reposError } = useRepositories();
    const { jobs, isPending: jobsPending, error: jobsError } = useGlobalJobs();
    const { latestPerJob } = useLatestPerJob();
    const { getClientStatus, getClientName, triggerNow, requestDelete } = useGlobalJobActions();

    const [failedPage, setFailedPage] = useState(1);
    const failed = useGlobalHistory({ page: failedPage, pageSize: PAGE_SIZE.embedded, status: JOB_STATUS.FAILED });

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
        return () => clearInterval(timer);
    }, []);

    const lastRuns = useMemo(() => lastRunByJob(latestPerJob), [latestPerJob]);
    const lastRunOf = (job: GlobalJob) => (job.id ? lastRuns.get(lastRunKey(job.clientId, job.id)) : undefined);
    const missed = missedJobs(jobs, clients, lastRunOf, now);

    // The cleanup can take the page that is open away; the list then shows the last one.
    // Corrected while rendering rather than in an effect: the page is this component's
    // own state, and no frame should show an empty list above a total that says otherwise.
    const failedTotal = failed.data?.total ?? 0;
    const pastTheEnd = !!failed.data && !failed.isPlaceholderData && failed.data.items.length === 0 && failedTotal > 0;
    const lastFailedPage = lastPage(failedTotal, PAGE_SIZE.embedded);
    if (pastTheEnd && failedPage !== lastFailedPage) setFailedPage(lastFailedPage);

    if (clientsPending || reposPending || jobsPending) {
        return <LoadingIndicator label="Loading dashboard…" />;
    }

    const nothingWrong = missed.length === 0 && !failed.isPending && !failed.error && failedTotal === 0;

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <StatCard
                    label="Hosts online"
                    value={clientsError ? '–' : formatOnlineCount(clientCount(clients))}
                    sub="Clients"
                    icon={Monitor}
                    onClick={() => navigate(ROUTES.clients)}
                    classNames={{ icon: 'text-text-muted' }}
                />
                <StatCard
                    label="Repositories online"
                    value={reposError ? '–' : formatOnlineCount(repositoryCount(repositories))}
                    sub="Repositories"
                    icon={Database}
                    onClick={() => navigate(ROUTES.repositories)}
                    classNames={{ icon: 'text-text-muted' }}
                />
                <StatCard
                    label="Jobs active"
                    value={jobsError ? '–' : String(activeJobCount(jobs, clients))}
                    sub="On clients that are online"
                    icon={HardDrive}
                    onClick={() => navigate(ROUTES.jobs)}
                    classNames={{ icon: 'text-text-muted' }}
                />
            </div>

            {clientsError && <QueryError title="Could not load the clients" error={clientsError} />}
            {reposError && <QueryError title="Could not load the repositories" error={reposError} />}
            {jobsError && <QueryError title="Could not load the jobs" error={jobsError} />}

            <section className="flex flex-col gap-4" aria-labelledby="dashboard-problems">
                <h2 id="dashboard-problems" className="text-lg font-bold text-text-primary">
                    Errors / Warnings
                </h2>

                {nothingWrong && (
                    <Card>
                        <EmptyState
                            icon={CircleCheck}
                            title="No errors or warnings"
                            description="No scheduled job was missed and no run has failed."
                        />
                    </Card>
                )}

                {missed.length > 0 && (
                    <BaseJobList
                        jobs={missed}
                        title="Missed Jobs"
                        showClientColumn
                        onEditJob={(job) => job.id && navigate(paths.job(job.clientId, job.id))}
                        onTriggerJob={triggerNow}
                        onDeleteJob={requestDelete}
                        getClientStatus={getClientStatus}
                        getClientName={getClientName}
                        getLastRun={lastRunOf}
                        viewModePersistKey="missedJobViewMode"
                        searchParamKey="search.missed"
                    />
                )}

                {failed.isPending ? (
                    <LoadingIndicator label="Loading failed runs…" />
                ) : failed.error ? (
                    <QueryError title="Could not load the failed runs" error={failed.error} />
                ) : (
                    failedTotal > 0 && (
                        <BaseHistoryList
                            items={failed.data.items}
                            title="Failed Runs"
                            showClientName
                            paging={{
                                mode: 'server',
                                value: { page: failedPage, pageSize: PAGE_SIZE.embedded },
                                onChange: ({ page }) => setFailedPage(page),
                                totalItems: failedTotal,
                                hideOnSinglePage: true,
                            }}
                        />
                    )
                )}
            </section>
        </div>
    );
};
