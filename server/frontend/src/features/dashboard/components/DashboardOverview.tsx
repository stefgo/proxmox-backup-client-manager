import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { REPOSITORY_STATUS } from '@pbcm/shared';
import { CheckCheck, CircleCheck, Database, HardDrive, Monitor, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button, Card, EmptyState, LoadingIndicator, StatCard, StatCardGrid, PAGE_SIZE } from '@stefgo/react-ui-components';
import { useClients } from '../../../queries/clients';
import { useRepositories } from '../../../queries/repositories';
import { useGlobalJobs } from '../../../queries/jobs';
import { useGlobalHistory, useUnseen } from '../../../queries/history';
import { BaseHistoryList } from '../../history/components/BaseHistoryList';
import { useMarkSeen } from '../../history/hooks/useMarkSeen';
import { lastPage } from '../../history/lib/historyView';
import { QueryError } from '../../../components/QueryError';
import { ROUTES } from '../../../lib/paths';
import {
    activeJobCount,
    clientCount,
    clientSummary,
    formatOnlineCount,
    hasOfflineClient,
    problemSummary,
    repositoryCount,
    repositorySummary,
} from '../lib/dashboard';
import { BACKUP_STATUS } from '../lib/findings';
import { useBackupOverview } from '../hooks/useBackupOverview';
import { FindingList } from './FindingList';
import { BackupStatusList } from './BackupStatusList';

const QUIET = 'text-text-muted';

/**
 * The start page: how the backups are doing, and what needs a look.
 *
 * The first card is the backups' status, by their worst finding; the findings themselves are
 * listed below the cards under "Needs attention", each the way to where it can be dealt
 * with. A finding is a state -- it goes once the problem does. The next three cards are the
 * counts the sidebar shows as badges, each the way to its list. The last counts what the user
 * has yet to mark as seen -- the runs that failed, and the scheduled runs an agent reported as
 * missed -- and the section of the same name lists them. At the bottom, "Backup status" is
 * the last run of every job, problems first.
 *
 * A run stays in that list until the user marks it as seen, here or in the history; that
 * a later run of the same job went well does not take it away. The mark is the user's
 * own: what one user has seen is still new to another.
 *
 * The section is there while it has something to show. With nothing left it is gone, and
 * the fourth card opens it to say so; with something left the card leads down to it.
 */
export const DashboardOverview = () => {
    const navigate = useNavigate();
    const { clients, isPending: clientsPending, error: clientsError } = useClients();
    const { repositories, isPending: reposPending, error: reposError } = useRepositories();
    const { jobs, isPending: jobsPending, error: jobsError } = useGlobalJobs();
    const backups = useBackupOverview();

    const [page, setPage] = useState(1);
    // Asked for by a click on the card. Only decides anything while there is nothing to list.
    const [problemsOpened, setProblemsOpened] = useState(false);
    const problemsRef = useRef<HTMLElement>(null);
    const { unseen, isPending: unseenPending, error: unseenError } = useUnseen();
    const problems = useGlobalHistory({ page, pageSize: PAGE_SIZE.embedded, unseen: true });
    const seen = useMarkSeen();

    // Marking the last run of a page as seen, or the cleanup, can take the page that is
    // open away; the list then shows the last one. Corrected while rendering rather than
    // in an effect: the page is this component's own state, and no frame should show an
    // empty list above a total that says otherwise.
    const total = problems.data?.total ?? 0;
    const pastTheEnd = !!problems.data && !problems.isPlaceholderData && problems.data.items.length === 0 && total > 0;
    const last = lastPage(total, PAGE_SIZE.embedded);
    if (pastTheEnd && page !== last) setPage(last);

    if (clientsPending || reposPending || jobsPending) {
        return <LoadingIndicator label="Loading dashboard…" />;
    }

    const failed = unseen?.failed ?? 0;
    const missed = unseen?.missed ?? 0;
    const problemCount = failed + missed;
    // A read that failed is something to show too: the count above it is not known.
    const readError = unseenError ?? problems.error;
    const hasProblems = problemCount > 0 || total > 0 || !!readError;
    const showProblems = hasProblems || problemsOpened;

    const onProblemsCard = () => {
        if (hasProblems) problemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else setProblemsOpened((open) => !open);
    };

    return (
        <div className="flex flex-col gap-6">
            <StatCardGrid>
                <StatCard
                    label="Backups"
                    value={BACKUP_STATUS[backups.status].label}
                    sub={backups.summary}
                    icon={ShieldCheck}
                    classNames={{ icon: BACKUP_STATUS[backups.status].tone }}
                />
                <StatCard
                    label="Hosts online"
                    value={clientsError ? '–' : formatOnlineCount(clientCount(clients))}
                    sub={clientsError ? 'Not known' : clientSummary(clients)}
                    icon={Monitor}
                    onClick={() => navigate(ROUTES.clients)}
                    classNames={{ icon: !clientsError && hasOfflineClient(clients) ? 'text-warning' : QUIET }}
                />
                <StatCard
                    label="Repositories online"
                    value={reposError ? '–' : formatOnlineCount(repositoryCount(repositories))}
                    sub={reposError ? 'Not known' : repositorySummary(repositories)}
                    icon={Database}
                    onClick={() => navigate(ROUTES.repositories)}
                    classNames={{
                        icon:
                            !reposError && repositories.some((r) => r.status === REPOSITORY_STATUS.OFFLINE)
                                ? 'text-warning'
                                : QUIET,
                    }}
                />
                <StatCard
                    label="Jobs active"
                    value={jobsError ? '–' : String(activeJobCount(jobs, clients))}
                    sub="On clients that are online"
                    icon={HardDrive}
                    onClick={() => navigate(ROUTES.jobs)}
                    classNames={{ icon: QUIET }}
                />
                <StatCard
                    label="Errors / Warnings"
                    // Until the server has answered, a zero would read as "nothing wrong".
                    value={unseen ? String(problemCount) : '–'}
                    sub={unseenPending ? 'Loading…' : unseen ? problemSummary(missed, failed) : 'Not known'}
                    icon={TriangleAlert}
                    onClick={onProblemsCard}
                    selected={showProblems}
                    aria-expanded={showProblems}
                    aria-controls="dashboard-problems-section"
                    classNames={{
                        icon: failed > 0 ? 'text-error' : missed > 0 ? 'text-warning' : QUIET,
                    }}
                />
            </StatCardGrid>

            {clientsError && <QueryError title="Could not load the clients" error={clientsError} />}
            {reposError && <QueryError title="Could not load the repositories" error={reposError} />}
            {jobsError && <QueryError title="Could not load the jobs" error={jobsError} />}

            {backups.findings.length > 0 && (
                <Card title="Needs attention" titleAs="h2">
                    <FindingList findings={backups.findings} />
                </Card>
            )}

            {showProblems && (
                <section
                    ref={problemsRef}
                    id="dashboard-problems-section"
                    className="flex flex-col gap-4"
                    aria-label="Errors / Warnings"
                >
                    {!hasProblems && (
                        <Card>
                            <EmptyState
                                icon={CircleCheck}
                                title="No errors or warnings"
                                description="Every failed and every missed run has been marked as seen."
                            />
                        </Card>
                    )}

                    {readError ? (
                        <QueryError title="Could not load the errors and warnings" error={readError} />
                    ) : (
                        problems.data &&
                        total > 0 && (
                            <BaseHistoryList
                                items={problems.data.items}
                                title="Errors / Warnings"
                                showClientName
                                onMarkSeen={seen.markRun}
                                markingRunId={seen.markingRunId}
                                action={
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        icon={CheckCheck}
                                        disabled={seen.markingAll}
                                        onClick={seen.markAll}
                                    >
                                        Mark all as seen
                                    </Button>
                                }
                                paging={{
                                    mode: 'server',
                                    value: { page, pageSize: PAGE_SIZE.embedded },
                                    onChange: (next) => setPage(next.page),
                                    totalItems: total,
                                    hideOnSinglePage: true,
                                }}
                            />
                        )
                    )}
                </section>
            )}

            {!backups.runsPending && <BackupStatusList runs={backups.runs} error={backups.runsError} />}
        </div>
    );
};
