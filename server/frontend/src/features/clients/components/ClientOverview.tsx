import { HardDrive, Activity, FileBox, MoreVertical, Edit, Network } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { StatCard, ActionButton, cn } from '@stefgo/react-ui-components';
import { Client, JOB_STATUS, CLIENT_STATUS } from '@pbcm/shared';
import { ClientJobEditor } from './ClientJobEditor';
import { formatDate, getErrorMessage } from '../../../utils';
import { ClientJobList } from './ClientJobList';
import { ConnectionBadge } from './ConnectionBadge';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientDetailStore, SnapshotWithRepository } from '../../../stores/useClientDetailStore';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';
import { SnapshotRestoreEditor } from '../../repositories/components/SnapshotRestoreEditor';

import { useJobForm } from '../hooks/useJobForm';
import { useClientSubscription } from '../../../hooks/useClientSubscription';
import { ActionMenu, Card, useActionMenu, FOCUS_RING_NONE } from '@stefgo/react-ui-components';


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

    const { token } = useAuth();
    const navigate = useNavigate();
    const { pathname, state } = useLocation();
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

    const { fileList, isLoadingFiles, fetchFileList } = useClientFileSystemStore();

    const { repositories, fetchRepositories } = useRepositoryStore();

    const refreshCurrentClient = () => {
        if (token) fetchClientData(client.id);
    };

    const deleteJob = (clientId: string, jobId: string) => {
        if (token) return storeDeleteJob(clientId, jobId);
        return Promise.reject('No token');
    };

    const triggerJob = (clientId: string, jobId: string) => {
        if (token) return storeTriggerJob(clientId, jobId);
        return Promise.reject('No token');
    };

    // Init Data & Subscriptions
    useEffect(() => {
        if (client.id && token) {
            fetchClientData(client.id);
            fetchRepositories();
        }
    }, [client.id, token, fetchClientData, fetchRepositories]);

    // Which repositories exist, not the array holding them: fetchRepositories kicks
    // off a checkRepositoryStatus per repository, and each of those replaces the
    // array. Depending on the reference reloaded every snapshot once per repository,
    // and each reload is itself one request per repository.
    const repositoryIds = useMemo(
        () => repositories.map((r) => r.id).join(","),
        [repositories],
    );

    useEffect(() => {
        if (client.id && token && repositories.length > 0) {
            fetchClientSnapshots(client.id, repositories);
        }
        // repositoryIds deliberately stands in for repositories -- see above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.id, token, repositoryIds, fetchClientSnapshots]);

    useClientSubscription(client.id, (job) => {
        if (job.status === JOB_STATUS.SUCCESS && token) {
            fetchClientSnapshots(client.id, repositories);
        }
    });

    // Form Hook
    const jobForm = useJobForm({
        clientId: client.id,
        onSaveSuccess: refreshCurrentClient
    });

    // File Browser Sync
    useEffect(() => {
        if (jobForm.isCreatingJob && client.id && token) {
            fetchFileList(client.id, jobForm.fileBrowserPath);
        }
    }, [
        jobForm.isCreatingJob,
        jobForm.fileBrowserPath,
        client.id,
        token,
        fetchFileList,
    ]);


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

    const handleDeleteJob = async (jobId: string) => {
        try {
            await deleteJob(client.id, jobId);
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        }
    };

    /**
     * Escape does what the closest close button does, exactly as in the client editor. The
     * page nests two editors inside itself, so it steps out of them one at a time: from the
     * job editor or the restore editor back to the overview -- the same thing their own `X`
     * does, and without a confirmation because neither button asks for one -- and only from
     * the bare overview back to the list. Leaving straight for the list out of a half-filled
     * job form would discard it, which is not what the operator pressed the key for.
     */
    const { isCreatingJob, setIsCreatingJob } = jobForm;
    const requestClose = useCallback(() => {
        if (restoreSnapshot) {
            setRestoreSnapshot(null);
            return;
        }
        if (isCreatingJob) {
            setIsCreatingJob(false);
            return;
        }
        navigate(back);
        // `jobForm` itself is a fresh object on every render; the two members it is read for
        // are not, so the listener below is registered once instead of on each render.
    }, [restoreSnapshot, isCreatingJob, setIsCreatingJob, navigate, back]);

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
                    {jobForm.isCreatingJob ? (
                        <ClientJobEditor
                            {...jobForm}
                            repositories={repositories}
                            fileList={fileList}
                            isLoadingFiles={isLoadingFiles}
                        />
                    ) : (
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
                                            onEditJob={jobForm.startEditJob}
                                            onTriggerJob={handleTriggerJob}
                                            onDeleteJob={handleDeleteJob}
                                            onCreateJob={jobForm.startCreateJob}
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
                </>
            )
            }
        </div >
    );
};

