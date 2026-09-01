import { HardDrive, Activity, FileBox, MoreVertical, Edit } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { StatCard } from '@stefgo/react-ui-components';
import { Client, JOB_STATUS } from '@pbcm/shared';
import { ClientJobEditor } from './ClientJobEditor';
import { formatDate, getErrorMessage } from '../../../utils';
import { ClientJobList } from './ClientJobList';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientDetailStore, SnapshotWithRepository } from '../../../stores/useClientDetailStore';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';
import { SnapshotRestoreEditor } from '../../repositories/components/SnapshotRestoreEditor';

import { useJobForm } from '../hooks/useJobForm';
import { useClientSubscription } from '../../../hooks/useClientSubscription';
import { ClientEditor } from './ClientEditor';
import { useClientStore } from '../../../stores/useClientStore';
import { ActionMenu, Card, useActionMenu } from '@stefgo/react-ui-components';


interface ClientOverviewProps {
    client: Client;
}

export const ClientOverview = ({ client }: ClientOverviewProps) => {

    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab');
    const activeTab = (tab === 'history' || tab === 'snapshots') ? tab : 'jobs';

    const setActiveTab = (tab: 'jobs' | 'history' | 'snapshots') => {
        setSearchParams({ tab });
    };

    // Client Store for updates
    const { updateClient } = useClientStore();

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

    // Header / Edit Logic
    const [isEditing, setIsEditing] = useState(false);
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

    const handleUpdateClient = async (id: string, data: { displayName?: string; outboundTargetAddress?: string }) => {
        if (!token) return;
        try {
            await updateClient(id, data);
            setIsEditing(false);
        } catch (e: unknown) {
            console.error("Failed to update client", e);
            throw e;
        }
    };

    if (isEditing) {
        return (
            <ClientEditor
                client={client}
                onSave={handleUpdateClient}
                onCancel={() => setIsEditing(false)}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Detail View */}
            <Card
                title={
                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${client.status === 'online' ? 'bg-success shadow-glow-success animate-pulse-glow' : 'bg-border'}`} />
                        <div>
                            <h2 className="text-2xl font-bold">
                                {client.displayName || client.hostname}
                            </h2>
                            <div className="text-sm font-mono text-text-muted">
                                {client.id}
                            </div>
                        </div>
                    </div>
                }
                action={
                    <div className="flex items-center gap-4">
                        {client.status !== 'online' && (
                            <div className="text-right mr-2">
                                <div className="text-xs text-text-muted uppercase tracking-wider font-bold mb-1">Last Seen</div>
                                <div className="text-sm text-text-primary font-mono">{formatDate(client.lastSeen)}</div>
                            </div>
                        )}
                        <div className="relative">
                            <button
                                onClick={(e) => openMenu(e, client.id)}
                                className="p-2 hover:bg-hover rounded-full transition-colors text-text-muted"
                            >
                                <MoreVertical size={20} />
                            </button>
                            <ActionMenu
                                isOpen={menuState?.id === client.id}
                                onClose={closeMenu}
                                anchor={menuState?.anchor ?? null}
                            >
                                <button
                                    onClick={() => {
                                        setIsEditing(true);
                                        closeMenu();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover flex items-center gap-2"
                                >
                                    <Edit size={16} /> Edit Client
                                </button>
                            </ActionMenu>
                        </div>
                    </div>
                }
            />

            {client.status === 'online' && (
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

