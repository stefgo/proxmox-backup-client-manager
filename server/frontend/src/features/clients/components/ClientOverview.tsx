import { HardDrive, Activity, FileBox, MoreVertical, Edit, Network } from 'lucide-react';
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatCard, ActionButton, EmptyState, LoadingIndicator, TabList, TabPanel, useTabs, StatusDot, PAGE_SIZE } from '@stefgo/react-ui-components';
import { BackupJob, Client, CLIENT_STATUS, CONNECTION_MODE } from '@pbcm/shared';
import { EMPTY_VALUE, formatRelativeDate, getErrorMessage } from '../../../utils';
import { useNow } from '../../../hooks/useNow';
import { ClientJobList } from './ClientJobList';
import { ConnectionBadge } from './ConnectionBadge';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientHistory, useClientJobs, useClientSnapshots, useStoredClientHistory } from '../../../queries/clientDetail';
import { BaseHistoryList } from '../../history/components/BaseHistoryList';
import { QueryError } from '../../../components/QueryError';
import { useDeleteJob, useLatestPerJob, useTriggerJob } from '../../../queries/jobs';
import { lastRunByJob, lastRunKey } from '../../jobs/lib/lastRun';
import { useRepositories } from '../../../queries/repositories';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';

import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { useBackPath } from '../../../hooks/useBackPath';
import { CLIENT_TABS, paths } from '../../../lib/paths';
import { ActionMenu, Badge, EntityHeader, type EntityDetail, MenuItem, useActionMenu, useConfirm, useToast } from '@stefgo/react-ui-components';
import { describeDeleteJob } from '../../jobs/confirmations';
import { STORAGE_KEYS } from '../../../lib/storageKeys';


interface ClientOverviewProps {
    client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {

    const navigate = useNavigate();
    const { search } = useLocation();
    // The client list, this page's parent in the route tree. Without the query: `tab` and
    // the tabs' searches are this page's own and mean nothing on the list.
    const back = useBackPath({ keepSearch: false });
    // Through the merging hook, so switching tabs keeps each tab's own search parameter
    // instead of wiping it -- `setSearchParams({ tab })` used to drop everything else.
    const [tab, setTab] = useSearchQueryParam('tab');
    const now = useNow();
    const tabs = useTabs({
        tabs: CLIENT_TABS,
        value: (CLIENT_TABS as readonly string[]).includes(tab) ? tab : CLIENT_TABS[0],
        onChange: setTab,
    });

    const isOnline = client.status === CLIENT_STATUS.ONLINE;

    // Everything below reads the cache. The socket keeps the jobs and the history
    // current, and a finished backup makes the snapshots stale -- see WebSocketProvider.
    const { jobs: configuredJobs } = useClientJobs(client.id);
    const { history: runs, lastHistory } = useClientHistory(client.id);
    const { repositories } = useRepositories();
    const { snapshots: clientSnapshots, error: snapshotsError } = useClientSnapshots(client.id, repositories);
    // The jobs and the history above come from the agent and are empty while it is away.
    // The server has stored every run it was told of, so an offline client shows those.
    const [storedPage, setStoredPage] = useState(1);
    const stored = useStoredClientHistory(client.id, storedPage, PAGE_SIZE.embedded, !isOnline);
    // From the server's own history, as in the list across all clients: the job rows of
    // both lists read one cache entry.
    const { latestPerJob } = useLatestPerJob();
    const lastRuns = useMemo(() => lastRunByJob(latestPerJob), [latestPerJob]);
    const { mutateAsync: triggerJob } = useTriggerJob();
    const { mutateAsync: deleteJob } = useDeleteJob();

    /**
     * Every form reached from here is a page of its own, one level below this one. The
     * query goes along in the URL, so closing the form comes back to the tab -- and the
     * search -- it was opened from rather than to the client's default tab, also after a
     * reload.
     */
    const open = (pathname: string) => navigate({ pathname, search });

    const openJobEditor = (jobId?: string) =>
        open(jobId ? paths.clientJob(client.id, jobId) : paths.clientJobNew(client.id));

    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();

    const { confirm } = useConfirm();
    const { show } = useToast();

    const handleTriggerJob = async (jobId: string) => {
        try {
            await triggerJob({ clientId: client.id, jobId });
            show({ variant: 'success', title: 'Job started' });
        } catch (e: unknown) {
            show({ variant: 'error', title: 'Could not start the job', description: getErrorMessage(e) });
        }
    };

    // Left open on failure: the message and the button that retries belong together.
    const requestDeleteJob = (job: BackupJob) => {
        if (!job.id) return;
        const jobId = job.id;
        confirm({
            ...describeDeleteJob(job.name, client.displayName || client.hostname),
            onConfirm: () => deleteJob({ clientId: client.id, jobId }),
        });
    };

    /**
     * Escape leaves for the list, exactly as in the client editor. The job editor and the
     * restore form are routes of their own and handle their own Escape.
     */
    const requestClose = useCallback(() => navigate(back), [navigate, back]);

    // Not while a select, a dialog or an autocomplete is using Escape for itself.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            requestClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [requestClose]);

    const isInbound = client.connectionMode !== CONNECTION_MODE.OUTBOUND;

    /**
     * What the header row has no room for. All of it opens on request, so a closed header
     * is just the row -- the same split DIM's client page uses.
     */
    const details: EntityDetail[] = [
        { label: 'ID', value: client.id, copyable: client.id },
        { label: 'Agent', value: client.version || 'Unknown' },
        // The clock the agent keeps every repetition of a job on.
        { label: 'Time Zone', value: client.timezone || 'Unknown' },
        isInbound
            ? { label: 'Allowed IP', value: client.inboundAllowedIp || 'Any' }
            : { label: 'Target Address', value: client.outboundTargetAddress || '–' },
        ...(isInbound && client.ipAddress
            ? [{ label: 'Last IP', value: client.ipAddress }]
            : []),
        ...(isOnline ? [] : [{ label: 'Last Seen', value: formatRelativeDate(client.lastSeen, now) }]),
    ];

    return (
        <div className="space-y-6">
            <EntityHeader
                leading={
                    <StatusDot
                        size="md"
                        {...STATUS_DOT[isOnline ? STATUS_TONE.ONLINE : STATUS_TONE.OFFLINE]}
                        label={client.status}
                    />
                }
                title={client.displayName || client.hostname}
                meta={
                    <>
                        <Badge variant="info">{isInbound ? 'Inbound' : 'Outbound'}</Badge>
                        {!isOnline && <Badge variant="warning">Offline</Badge>}
                        {/*
                          * The same badge the list shows. `client` comes from the cache
                          * via the route, so the tunnel state here follows the socket
                          * rather than freezing at the moment the page opened.
                          */}
                        <ConnectionBadge client={client} />
                    </>
                }
                details={details}
                // Names the view, not the client: one entry for every client page.
                persist={{ key: STORAGE_KEYS.clientDetails, scope: 'local' }}
                actions={
                    <div className="relative">
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Client actions"
                            onClick={(e) => openMenu(e, client.id)}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === client.id}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            <MenuItem
                                icon={Edit}
                                onClick={() => open(paths.clientEdit(client.id))}
                            >
                                Edit Client
                            </MenuItem>
                            {/*
                              * Same entry as in the client list: setting a tunnel up and
                              * changing one are the same form on the same endpoint, so only
                              * the label turns on whether credentials are stored. Offered for
                              * either connection mode, because both can have a tunnel.
                              */}
                            <MenuItem
                                icon={Network}
                                onClick={() => open(paths.clientTunnel(client.id))}
                            >
                                {client.tunnelConfigured ? 'Edit Tunnel' : 'Add Tunnel'}
                            </MenuItem>
                        </ActionMenu>
                    </div>
                }
            />

            {/* The stat cards are the tab list: `tabProps` is what makes them announce
                themselves as tabs and puts the arrow keys on the row. Shown offline too:
                whether the backup ran is asked most when the client is away. */}
            <TabList tabs={tabs} aria-label="Client views" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <StatCard
                    {...tabs.tabProps('jobs')}
                    label="Backup Jobs"
                    // Not "0": the server does not know an offline client's jobs.
                    value={isOnline ? configuredJobs.length.toString() : EMPTY_VALUE}
                    sub={isOnline ? 'Configurations' : 'Client offline'}
                    icon={HardDrive}
                    classNames={{ icon: 'text-text-muted' }}
                />
                <StatCard
                    {...tabs.tabProps('snapshots')}
                    label="Snapshots"
                    value={clientSnapshots.length.toString()}
                    sub="Available Backups"
                    icon={FileBox}
                    classNames={{ icon: 'text-text-muted' }}
                />
                <StatCard
                    {...tabs.tabProps('history')}
                    label="Job History"
                    value={isOnline ? runs.length.toString() : (stored.data?.total.toString() ?? EMPTY_VALUE)}
                    sub="Recorded Runs"
                    icon={Activity}
                    classNames={{ icon: 'text-text-muted' }}
                />
            </TabList>

            <div className="space-y-6">
                {/* Configured Backup Jobs */}
                <TabPanel tabs={tabs} value="jobs">
                    <>
                        <ClientJobList
                            searchParamKey="search.jobs"
                            jobs={configuredJobs}
                            offline={!isOnline}
                            onEditJob={(job) => openJobEditor(job.id ?? undefined)}
                            onTriggerJob={handleTriggerJob}
                            onDeleteJob={(jobId) => {
                                const job = configuredJobs.find((j) => j.id === jobId);
                                if (job) requestDeleteJob(job);
                            }}
                            onCreateJob={() => openJobEditor()}
                            getLastRun={(job) => (job.id ? lastRuns.get(lastRunKey(client.id, job.id)) : undefined)}
                            clientId={client.id}
                        />
                        {/* The agent's last day. Offline, the history tab has the runs. */}
                        {isOnline && (
                            <div className="mt-6">
                                <ClientHistoryList
                                    title="Last History"
                                    history={lastHistory}
                                    clientId={client.id}
                                    emptyMessage={
                                        <EmptyState
                                            icon={Activity}
                                            title="No runs in the observation period"
                                            description="The agent reports the runs of its last day here; older ones are on the history tab."
                                        />
                                    }
                                />
                            </div>
                        )}
                    </>
                </TabPanel>

                {/* Snapshots */}
                <TabPanel tabs={tabs} value="snapshots">
                    <>
                        {snapshotsError && (
                            <div role="alert" className="mb-4 text-sm text-error break-words">
                                {snapshotsError}
                            </div>
                        )}
                        <RepositorySnapshotList
                            searchParamKey="search.snapshots"
                            snapshots={clientSnapshots}
                            showClientColumn={false}
                            // The restore form browses the client's file system for the
                            // target, which only a connected agent answers.
                            restoreDisabledReason={isOnline ? undefined : 'Client Offline'}
                            // The repository is part of the address: a client's
                            // snapshots come from every repository.
                            onRestore={(s) =>
                                open(paths.clientRestore(client.id, s.repository.id, s.backupType, s.backupTime))
                            }
                        />
                    </>
                </TabPanel>

                {/* Job History: every run, backups and restores alike -- what the card counts. */}
                <TabPanel tabs={tabs} value="history">
                    {isOnline ? (
                        <ClientHistoryList history={runs} clientId={client.id} />
                    ) : stored.isPending ? (
                        <LoadingIndicator label="Loading history…" />
                    ) : stored.error ? (
                        <QueryError title="Could not load the history" error={stored.error} />
                    ) : (
                        <BaseHistoryList
                            items={stored.data.items}
                            paging={{
                                mode: 'server',
                                value: { page: storedPage, pageSize: PAGE_SIZE.embedded },
                                onChange: ({ page }) => setStoredPage(page),
                                totalItems: stored.data.total,
                                hideOnSinglePage: true,
                            }}
                        />
                    )}
                </TabPanel>
            </div>

        </div >
    );
};

