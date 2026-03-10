import { HardDrive, Activity, FileBox, MoreVertical, Edit } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { StatCard } from '@stefgo/react-ui-components';
import { Client } from '@pbcm/shared';
import { ClientJobEditor } from './ClientJobEditor';
import { formatDate, getErrorMessage } from '../../../utils';
import { ClientJobList } from './ClientJobList';
import { ClientHistoryList } from './ClientHistoryList';
import { useClientDetailStore } from '../../../stores/useClientDetailStore';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';
import { RepositorySnapshotList } from '../../repositories/components/RepositorySnapshotList';
import { SnapshotRestoreEditor } from '../../repositories/components/SnapshotRestoreEditor';
import { Snapshot } from '@pbcm/shared';

import { useJobForm } from '../hooks/useJobForm';
import { useClientSubscription } from '../../../hooks/useClientSubscription';
import { ClientEditor } from './ClientEditor';
import { useClientStore } from '../../../stores/useClientStore';
import { ActionMenu } from '@stefgo/react-ui-components';
import { useActionMenu } from '@stefgo/react-ui-components';


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
        if (token) fetchClientData(client.id, token);
    };

    const deleteJob = (clientId: string, jobId: string) => {
        if (token) return storeDeleteJob(clientId, jobId, token);
        return Promise.reject('No token');
    };

    const triggerJob = (clientId: string, jobId: string) => {
        if (token) return storeTriggerJob(clientId, jobId, token);
        return Promise.reject('No token');
    };

    // Init Data & Subscriptions
    useEffect(() => {
        if (client && token) {
            fetchClientData(client.id, token);
            fetchRepositories(token);
        }
    }, [client, token]);

    useEffect(() => {
        if (client && token && repositories.length > 0) {
            fetchClientSnapshots(client.id, repositories, token);
        }
    }, [client, token, repositories]);

    useClientSubscription(client.id, (job) => {
        if (job.status === 'success' && token) {
            fetchClientSnapshots(client.id, repositories, token);
        }
    });

    // Form Hook
    const jobForm = useJobForm({
        clientId: client.id,
        onSaveSuccess: refreshCurrentClient
    });

    // File Browser Sync
    // useClientFileSystem hook already destructured above
    // store.fetchFileList is available.
    useEffect(() => {
        if (jobForm.isCreatingJob && client && token) {
            fetchFileList(client.id, jobForm.fileBrowserPath, token);
        }
    }, [jobForm.isCreatingJob, jobForm.fileBrowserPath, client, token]);


    const [restoreSnapshot, setRestoreSnapshot] = useState<Snapshot | null>(null);

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

    const handleUpdateClient = async (id: string, data: { displayName?: string }) => {
        if (!token) return;
        try {
            await updateClient(id, data, token);
            setIsEditing(false);
        } catch (e: unknown) {
            console.error("Failed to update client", e);
            alert(getErrorMessage(e));
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
            <div className="space-y-6">
                <div className="premium-card p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`w-3 h-3 rounded-full ${client.status === 'online' ? 'bg-green-500 shadow-glow-online animate-pulse-glow' : 'bg-gray-400 dark:bg-app-input'}`} />
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-app-text-main">
                                    {client.displayName || client.hostname}
                                </h2>
                                <div className="text-sm font-mono text-gray-500 dark:text-app-text-muted flex items-center gap-2">
                                    {client.id}
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Menu or Status */}
                        <div className="flex items-center gap-4">
                            {client.status !== 'online' && (
                                <div className="text-right mr-2">
                                    <div className="text-xs text-app-text-muted uppercase tracking-wider font-bold mb-1">Last Seen</div>
                                    <div className="text-sm text-gray-700 dark:text-app-text-main font-mono">{formatDate(client.lastSeen)}</div>
                                </div>
                            )}

                            {/* Kebab Menu */}
                            <div className="relative">
                                <button
                                    onClick={(e) => openMenu(e, client.id)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-app-input rounded-full transition-colors text-app-text-muted"
                                >
                                    <MoreVertical size={20} />
                                </button>

                                <ActionMenu
                                    isOpen={menuState?.id === client.id}
                                    onClose={closeMenu}
                                    position={menuState || { x: 0, y: 0 }}
                                >
                                    <button
                                        onClick={() => {
                                            setIsEditing(true);
                                            closeMenu();
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-app-text-main hover:bg-gray-50 dark:hover:bg-app-input flex items-center gap-2"
                                    >
                                        <Edit size={16} /> Edit Client
                                    </button>
                                </ActionMenu>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                                <div className={activeTab === 'jobs' ? 'ring-2 ring-app-accent rounded-xl h-full' : 'h-full'}>
                                    <StatCard
                                        label="Backup Jobs"
                                        value={configuredJobs.length.toString()}
                                        sub="Configurations"
                                        icon={<HardDrive className="text-app-text-muted" />}
                                        onClick={() => setActiveTab('jobs')}
                                    />
                                </div>
                                <div className={activeTab === 'snapshots' ? 'ring-2 ring-app-accent rounded-xl h-full' : 'h-full'}>
                                    <StatCard
                                        label="Snapshots"
                                        value={clientSnapshots.length.toString()}
                                        sub="Available Backups"
                                        icon={<FileBox className="text-app-text-muted" />}
                                        onClick={() => setActiveTab('snapshots')}
                                    />
                                </div>
                                <div className={activeTab === 'history' ? 'ring-2 ring-app-accent rounded-xl h-full' : 'h-full'}>
                                    <StatCard
                                        label="Job History"
                                        value={backupJobs.length.toString()}
                                        sub="Recorded Runs"
                                        icon={<Activity className="text-app-text-muted" />}
                                        onClick={() => setActiveTab('history')}
                                    />
                                </div>
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
                                            repo={(restoreSnapshot as any).repository}
                                            selectedClient={client}
                                            onCancel={() => setRestoreSnapshot(null)}
                                        />
                                    ) : (
                                        <RepositorySnapshotList
                                            snapshots={clientSnapshots}
                                            clients={[client]}
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

