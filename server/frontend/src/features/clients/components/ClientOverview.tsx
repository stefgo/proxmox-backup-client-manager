import { HardDrive, Activity, FileBox, MoreVertical, Edit, Network } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { StatCard, ActionButton, TabList, TabPanel, useTabs, StatusDot } from '@stefgo/react-ui-components';
import { BackupJob, Client, JOB_STATUS, CLIENT_STATUS, CONNECTION_MODE } from '@pbcm/shared';
import { formatDate, getErrorMessage } from '../../../utils';
import { ClientJobList } from './ClientJobList';
import { ConnectionBadge } from './ConnectionBadge';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientDetailStore, SnapshotWithRepository } from '../../../stores/useClientDetailStore';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';
import { SnapshotRestoreEditor } from '../../repositories/components/SnapshotRestoreEditor';

import { useClientSubscription } from '../../../hooks/useClientSubscription';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { markJobRunAsked, forgetJobRunAsked } from '../../../hooks/useJobResultToasts';
import { ActionMenu, Badge, EntityHeader, type EntityDetail, MenuItem, useActionMenu, useConfirm, useToast } from '@stefgo/react-ui-components';
import { describeDeleteJob } from '../../jobs/confirmations';
import { useResyncKey } from '../../app/context/WebSocketContext';


/** The tabs, in the order the arrow keys walk them. */
const TABS = ['jobs', 'snapshots', 'history'] as const;

interface ClientOverviewProps {
    client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {

    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const { pathname, search, state } = useLocation();
    // The list is the only surface that opens this page today, and the honest fallback for a
    // directly opened URL -- the same `from` convention the editors reached from here use.
    const back = (state as { from?: string } | null)?.from ?? '/clients';
    // Through the merging hook, so switching tabs keeps each tab's own search parameter
    // instead of wiping it -- `setSearchParams({ tab })` used to drop everything else.
    const [tab, setTab] = useSearchQueryParam('tab');
    const tabs = useTabs({
        tabs: TABS,
        value: (TABS as readonly string[]).includes(tab) ? tab : 'jobs',
        onChange: setTab,
    });

    // Global Store Data
    const {
        configuredJobs,
        history: backupJobs,
        lastHistory,
        clientSnapshots,
        snapshotsError,
        fetchClientData,
        deleteBackupJob: deleteJob,
        triggerBackupJob: triggerJob,
        fetchClientSnapshots
    } = useClientDetailStore();

    const { repositories, fetchRepositories } = useRepositoryStore();

    // Init Data & Subscriptions, and again after a reconnect.
    const resyncKey = useResyncKey();
    useEffect(() => {
        if (client.id && isAuthenticated) {
            fetchClientData(client.id);
            fetchRepositories();
        }
    }, [client.id, isAuthenticated, resyncKey, fetchClientData, fetchRepositories]);

    // Which repositories exist, not the array holding them: fetchRepositories kicks
    // off a checkRepositoryStatus per repository, and each of those replaces the
    // array. Depending on the reference reloaded every snapshot once per repository,
    // and each reload is itself one request per repository.
    const repositoryIds = useMemo(
        () => repositories.map((r) => r.id).join(','),
        [repositories],
    );

    useEffect(() => {
        if (client.id && isAuthenticated && repositories.length > 0) {
            fetchClientSnapshots(client.id, repositories);
        }
        // repositoryIds deliberately stands in for repositories -- see above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.id, isAuthenticated, repositoryIds, fetchClientSnapshots]);

    useClientSubscription(client.id, (job) => {
        if (job.status === JOB_STATUS.SUCCESS) {
            fetchClientSnapshots(client.id, repositories);
        }
    });

    /**
     * The job editor is a page of its own. `from` carries the open tab along, so saving or
     * cancelling comes back to the job list this was started from rather than to the
     * client's default tab.
     */
    const openJobEditor = (jobId?: string) => {
        navigate(`/client/${client.id}/jobs/${jobId ?? 'new'}`, {
            state: { from: pathname + search },
        });
    };

    const [restoreSnapshot, setRestoreSnapshot] = useState<SnapshotWithRepository | null>(null);

    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();

    const { confirm } = useConfirm();
    const { show } = useToast();

    const handleTriggerJob = async (jobId: string) => {
        // Before the request: a run that is skipped at once can report before it returns.
        markJobRunAsked(client.id, jobId);
        try {
            await triggerJob(client.id, jobId);
            show({ variant: 'success', title: 'Job started' });
        } catch (e: unknown) {
            forgetJobRunAsked(client.id, jobId);
            show({ variant: 'error', title: 'Could not start the job', description: getErrorMessage(e) });
        }
    };

    // Left open on failure: the message and the button that retries belong together.
    const requestDeleteJob = (job: BackupJob) => {
        if (!job.id) return;
        const jobId = job.id;
        confirm({
            ...describeDeleteJob(job.name, client.displayName || client.hostname),
            onConfirm: () => deleteJob(client.id, jobId),
        });
    };

    /**
     * Escape does what the closest close button does, exactly as in the client editor. The
     * restore editor still opens inside this page, so it is stepped out of first -- the same
     * thing its own `X` does, and without a confirmation because that button does not ask
     * either -- and only the bare overview leaves for the list. The job editor is a route of
     * its own and handles its own Escape.
     */
    const requestClose = useCallback(() => {
        if (restoreSnapshot) {
            setRestoreSnapshot(null);
            return;
        }
        navigate(back);
    }, [restoreSnapshot, navigate, back]);

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
                          * The same badge the list shows. `client` comes from the store
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
                                onClick={() => {
                                    // `from` is how the editor knows that back is this
                                    // page and not the client list.
                                    navigate(`/client/${client.id}/edit`, {
                                        state: { from: pathname },
                                    });
                                }}
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
                                onClick={() => {
                                    navigate(`/client/${client.id}/tunnel`, {
                                        state: { from: pathname },
                                    });
                                }}
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
                            {restoreSnapshot ? (
                                <SnapshotRestoreEditor
                                    snapshot={restoreSnapshot}
                                    repo={restoreSnapshot.repository}
                                    selectedClient={client}
                                    onCancel={() => setRestoreSnapshot(null)}
                                />
                            ) : (
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
                                        onRestore={setRestoreSnapshot}
                                    />
                                </>
                            )}
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

