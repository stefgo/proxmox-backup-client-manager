import { HardDrive, Activity, FileBox, MoreVertical, Edit, Network } from 'lucide-react';
import { useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatCard, ActionButton, TabList, TabPanel, useTabs, StatusDot } from '@stefgo/react-ui-components';
import { BackupJob, Client, CLIENT_STATUS, CONNECTION_MODE } from '@pbcm/shared';
import { formatDate, getErrorMessage } from '../../../utils';
import { ClientJobList } from './ClientJobList';
import { ConnectionBadge } from './ConnectionBadge';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientHistory, useClientJobs, useClientSnapshots } from '../../../queries/clientDetail';
import { useDeleteJob, useLatestPerJob, useTriggerJob } from '../../../queries/jobs';
import { lastRunByJob, lastRunKey } from '../../jobs/lib/lastRun';
import { useRepositories } from '../../../queries/repositories';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';

import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { useBackPath } from '../../../hooks/useBackPath';
import { paths } from '../../../lib/paths';
import { ActionMenu, Badge, EntityHeader, type EntityDetail, MenuItem, useActionMenu, useConfirm, useToast } from '@stefgo/react-ui-components';
import { describeDeleteJob } from '../../jobs/confirmations';


/** The tabs, in the order the arrow keys walk them. */
const TABS = ['jobs', 'snapshots', 'history'] as const;

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
    const tabs = useTabs({
        tabs: TABS,
        value: (TABS as readonly string[]).includes(tab) ? tab : 'jobs',
        onChange: setTab,
    });

    // Everything below reads the cache. The socket keeps the jobs and the history
    // current, and a finished backup makes the snapshots stale -- see WebSocketProvider.
    const { jobs: configuredJobs } = useClientJobs(client.id);
    const { history: backupJobs, lastHistory } = useClientHistory(client.id);
    const { repositories } = useRepositories();
    const { snapshots: clientSnapshots, error: snapshotsError } = useClientSnapshots(client.id, repositories);
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

    const isOnline = client.status === CLIENT_STATUS.ONLINE;
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
        ...(isOnline ? [] : [{ label: 'Last Seen', value: formatDate(client.lastSeen) }]),
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
                persist={{ key: 'pbcm.client.details', scope: 'local' }}
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

            {isOnline && (
                <>
                    {/* The stat cards are the tab list: `tabProps` is what makes them announce
                        themselves as tabs and puts the arrow keys on the row. */}
                    <TabList tabs={tabs} aria-label="Client views" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <StatCard
                            {...tabs.tabProps('jobs')}
                            label="Backup Jobs"
                            value={configuredJobs.length.toString()}
                            sub="Configurations"
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
                            value={backupJobs.length.toString()}
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
                                    onEditJob={(job) => openJobEditor(job.id ?? undefined)}
                                    onTriggerJob={handleTriggerJob}
                                    onDeleteJob={(jobId) => {
                                        const job = configuredJobs.find((j) => j.id === jobId);
                                        if (job) requestDeleteJob(job);
                                    }}
                                    onCreateJob={() => openJobEditor()}
                                    getLastRun={(job) => (job.id ? lastRuns.get(lastRunKey(client.id, job.id)) : undefined)}
                                />
                                <div className="mt-6">
                                    <ClientHistoryList
                                        title="Last History"
                                        history={lastHistory}
                                        emptyMessage="No data available in the observation period."
                                    />
                                </div>
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
                                    // The repository is part of the address: a client's
                                    // snapshots come from every repository.
                                    onRestore={(s) =>
                                        open(paths.clientRestore(client.id, s.repository.id, s.backupType, s.backupTime))
                                    }
                                />
                            </>
                        </TabPanel>

                        {/* Job History */}
                        <TabPanel tabs={tabs} value="history">
                            <ClientHistoryList
                                history={backupJobs}
                                type="backup"
                            />
                        </TabPanel>
                    </div>
                </>
            )
            }

        </div >
    );
};

