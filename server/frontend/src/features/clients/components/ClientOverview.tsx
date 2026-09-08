import { HardDrive, Activity, FileBox, MoreVertical, Edit, Network } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { StatCard, ActionButton, cn } from '@stefgo/react-ui-components';
import { BackupJob, Client, JOB_STATUS, CLIENT_STATUS } from '@pbcm/shared';
import { formatDate, getErrorMessage } from '../../../utils';
import { ClientJobList } from './ClientJobList';
import { ConnectionBadge } from './ConnectionBadge';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientDetailStore, SnapshotWithRepository } from '../../../stores/useClientDetailStore';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';
import { SnapshotRestoreEditor } from '../../repositories/components/SnapshotRestoreEditor';

import { useClientSubscription } from '../../../hooks/useClientSubscription';
import { ActionMenu, Card, ConfirmDialog, useActionMenu, FOCUS_RING_NONE } from '@stefgo/react-ui-components';


/**
 * A menu entry marks focus with its background, the way the menu's own entries do -- a ring
 * inside the popover would be clipped by it. Shared by the entries below so they cannot drift.
 */
const MENU_ENTRY = cn(
    "w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover focus-visible:bg-hover flex items-center gap-2",
    FOCUS_RING_NONE,
);

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
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab');
    const activeTab = (tab === 'history' || tab === 'snapshots') ? tab : 'jobs';

    const setActiveTab = (tab: 'jobs' | 'history' | 'snapshots') => {
        setSearchParams({ tab });
    };

    // Global Store Data
    const {
        configuredJobs,
        history: backupJobs,
        lastHistory,
        clientSnapshots,
        fetchClientData,
        deleteBackupJob: storeDeleteJob,
        triggerBackupJob: storeTriggerJob,
        fetchClientSnapshots
    } = useClientDetailStore();

    const { repositories, fetchRepositories } = useRepositoryStore();

    const deleteJob = (clientId: string, jobId: string) => {
        if (isAuthenticated) return storeDeleteJob(clientId, jobId);
        return Promise.reject('Not authenticated');
    };

    const triggerJob = (clientId: string, jobId: string) => {
        if (isAuthenticated) return storeTriggerJob(clientId, jobId);
        return Promise.reject('Not authenticated');
    };

    // Init Data & Subscriptions
    useEffect(() => {
        if (client.id && isAuthenticated) {
            fetchClientData(client.id);
            fetchRepositories();
        }
    }, [client.id, isAuthenticated, fetchClientData, fetchRepositories]);

    // Which repositories exist, not the array holding them: fetchRepositories kicks
    // off a checkRepositoryStatus per repository, and each of those replaces the
    // array. Depending on the reference reloaded every snapshot once per repository,
    // and each reload is itself one request per repository.
    const repositoryIds = useMemo(
        () => repositories.map((r) => r.id).join(","),
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
        if (job.status === JOB_STATUS.SUCCESS && isAuthenticated) {
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

    const { menuState, openMenu, closeMenu } = useActionMenu<string>();

    const handleTriggerJob = async (jobId: string) => {
        try {
            await triggerJob(client.id, jobId);
            // Optional: toast or feedback
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        }
    };

    /**
     * The job itself, not just its id: the dialog names it, and one dialog serves the
     * whole list. Same wording as the global job list -- it is the same operation.
     */
    const [pendingDeleteJob, setPendingDeleteJob] = useState<BackupJob | null>(null);
    const [isDeletingJob, setIsDeletingJob] = useState(false);

    const confirmDeleteJob = async () => {
        if (!pendingDeleteJob?.id) return;
        setIsDeletingJob(true);
        try {
            await deleteJob(client.id, pendingDeleteJob.id);
            setPendingDeleteJob(null);
        } catch (e: unknown) {
            // Left open: the message and the button that retries belong together.
            alert(getErrorMessage(e));
        } finally {
            setIsDeletingJob(false);
        }
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

    return (
        <div className="space-y-6">
            {/* Detail View */}
            <Card
                title={
                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${client.status === CLIENT_STATUS.ONLINE ? 'bg-success shadow-glow-success animate-pulse-glow' : 'bg-border'}`} />
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold">
                                    {client.displayName || client.hostname}
                                </h2>
                                {/*
                                  * The same badge the list shows. `client` comes from the store
                                  * via the route, so the tunnel state here follows the socket
                                  * rather than freezing at the moment the page opened.
                                  */}
                                <ConnectionBadge client={client} />
                            </div>
                            <div className="text-sm font-mono text-text-muted">
                                {client.id}
                            </div>
                        </div>
                    </div>
                }
                action={
                    <div className="flex items-center gap-4">
                        {client.status !== CLIENT_STATUS.ONLINE && (
                            <div className="text-right mr-2">
                                <div className="text-xs text-text-muted uppercase tracking-wider font-bold mb-1">Last Seen</div>
                                <div className="text-sm text-text-primary font-mono">{formatDate(client.lastSeen)}</div>
                            </div>
                        )}
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
                            >
                                <button
                                    onClick={() => {
                                        // `from` is how the editor knows that back is this
                                        // page and not the client list.
                                        navigate(`/client/${client.id}/edit`, {
                                            state: { from: pathname },
                                        });
                                        closeMenu();
                                    }}
                                    className={MENU_ENTRY}
                                >
                                    <Edit size={16} /> Edit Client
                                </button>
                                {/*
                                  * Same entry as in the client list: setting a tunnel up and
                                  * changing one are the same form on the same endpoint, so only
                                  * the label turns on whether credentials are stored. Offered for
                                  * either connection mode, because both can have a tunnel.
                                  */}
                                <button
                                    onClick={() => {
                                        navigate(`/client/${client.id}/tunnel`, {
                                            state: { from: pathname },
                                        });
                                        closeMenu();
                                    }}
                                    className={MENU_ENTRY}
                                >
                                    <Network size={16} /> {client.tunnelConfigured ? 'Edit Tunnel' : 'Add Tunnel'}
                                </button>
                            </ActionMenu>
                        </div>
                    </div>
                }
            />

            {client.status === CLIENT_STATUS.ONLINE && (
                <>
                    {/* Client Stats Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <StatCard
                            label="Backup Jobs"
                            value={configuredJobs.length.toString()}
                            sub="Configurations"
                            icon={HardDrive}
                            classNames={{ icon: "text-text-muted" }}
                            selected={activeTab === 'jobs'}
                            onClick={() => setActiveTab('jobs')}
                        />
                        <StatCard
                            label="Snapshots"
                            value={clientSnapshots.length.toString()}
                            sub="Available Backups"
                            icon={FileBox}
                            classNames={{ icon: "text-text-muted" }}
                            selected={activeTab === 'snapshots'}
                            onClick={() => setActiveTab('snapshots')}
                        />
                        <StatCard
                            label="Job History"
                            value={backupJobs.length.toString()}
                            sub="Recorded Runs"
                            icon={Activity}
                            classNames={{ icon: "text-text-muted" }}
                            selected={activeTab === 'history'}
                            onClick={() => setActiveTab('history')}
                        />
                    </div>

                    <div className="space-y-6">
                        {/* Configured Backup Jobs */}
                        {activeTab === 'jobs' && (
                            <>
                                <ClientJobList
                                    jobs={configuredJobs}
                                    onEditJob={(job) => openJobEditor(job.id ?? undefined)}
                                    onTriggerJob={handleTriggerJob}
                                    onDeleteJob={(jobId) => {
                                        const job = configuredJobs.find((j) => j.id === jobId);
                                        if (job) setPendingDeleteJob(job);
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
                        )}

                        {/* Snapshots */}
                        {activeTab === 'snapshots' && (
                            restoreSnapshot ? (
                                <SnapshotRestoreEditor
                                    snapshot={restoreSnapshot}
                                    repo={restoreSnapshot.repository}
                                    selectedClient={client}
                                    onCancel={() => setRestoreSnapshot(null)}
                                />
                            ) : (
                                <RepositorySnapshotList
                                    snapshots={clientSnapshots}
                                    showClientColumn={false}
                                    onRestore={setRestoreSnapshot}
                                />
                            )
                        )}

                        {/* Job History */}
                        {activeTab === 'history' && (
                            <ClientHistoryList
                                history={backupJobs}
                                type="backup"
                            />
                        )}
                    </div>
                </>
            )
            }

            {/*
              * Runs through the agent (JOB_DELETE_CONFIG), so it needs the client online.
              * The configuration goes, the backups do not.
              */}
            <ConfirmDialog
                isOpen={!!pendingDeleteJob}
                onClose={() => setPendingDeleteJob(null)}
                onConfirm={confirmDeleteJob}
                title={`Delete job "${pendingDeleteJob?.name}"?`}
                description="The agent drops the job and its schedule, so this client has to be online for it. Snapshots already in the repository and the run history stay."
                confirmLabel="Delete job"
                variant="danger"
                isConfirming={isDeletingJob}
            />
        </div >
    );
};

