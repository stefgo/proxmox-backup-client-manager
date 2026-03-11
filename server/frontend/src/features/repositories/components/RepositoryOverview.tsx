import { useNavigate } from 'react-router-dom';
import { AlertCircle, FileBox } from 'lucide-react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { Snapshot } from '@pbcm/shared';
import { useState, useEffect } from 'react';
import { SnapshotRestoreEditor } from './SnapshotRestoreEditor';
import { RepositorySnapshotList } from './RepositorySnapshotList';
import { StatCard } from '@stefgo/react-ui-components';
import { useRepositorySnapshotStore } from '../../../stores/useRepositorySnapshotStore';
import { useClientStore } from '../../../stores/useClientStore';
import { useAuth } from '../../auth/AuthContext';


interface RepositoryOverviewProps {
    repo: Repository;
}

export const RepositoryOverview = ({ repo }: RepositoryOverviewProps) => {

    const navigate = useNavigate();
    const { token } = useAuth();
    const [restoreSnapshot, setRestoreSnapshot] = useState<Snapshot | null>(null);
    const [activeTab, setActiveTab] = useState<'snapshots' | 'history'>('snapshots');

    // Global Store Data
    const { snapshots, isLoading, error, fetchSnapshots } = useRepositorySnapshotStore();
    const { clients, fetchClients } = useClientStore();
    // const { fetchClients } = useClientActions();


    // Fetch Snapshots on mount or repo change
    useEffect(() => {
        if (repo && token) {
            fetchSnapshots(repo, token);
        }
    }, [repo, token]);

    // Fetch Clients needed for restore if not already loaded
    useEffect(() => {
        if (clients.length === 0 && token) {
            fetchClients(token);
        }
    }, [clients.length, token, fetchClients]);

    const getStatusColor = () => {
        if (isLoading) return 'bg-yellow-500 animate-pulse shadow-glow-accent';
        if (repo?.status === 'online') return 'bg-green-500 shadow-glow-online';
        return 'bg-gray-400 dark:bg-app-input';
    };

    if (!repo) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-500 gap-4">
                <AlertCircle size={48} />
                <p>Repository not found</p>
                <button onClick={() => navigate('/')} className="text-blue-500 hover:underline">Go Back</button>
            </div>
        );
    }

    const showDetails = !isLoading && !error && repo.status === 'online';

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="premium-card p-6">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-app-text-main flex items-center gap-3">
                                {repo.baseUrl}:{repo.datastore}
                            </h2>
                            <div className="text-sm font-mono text-gray-500 dark:text-app-text-muted flex items-center gap-2">
                                {repo.id}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stat Cards & Details - Only when online and not loading */}
            {showDetails && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className={activeTab === 'snapshots' ? 'ring-2 ring-app-accent rounded-xl h-full' : 'h-full'}>
                            <StatCard
                                label="Snapshots"
                                value={snapshots.length.toString()}
                                sub="Available Backups"
                                icon={<FileBox className="text-app-text-muted" />}
                                onClick={() => setActiveTab('snapshots')}
                            />
                        </div>
                    </div>

                    {/* Snapshots List OR Restore View */}
                    {activeTab === 'snapshots' && (
                        restoreSnapshot ? (
                            <div className="flex-1 overflow-hidden">
                                <SnapshotRestoreEditor
                                    snapshot={restoreSnapshot}
                                    repo={repo}
                                    clients={clients}
                                    onCancel={() => setRestoreSnapshot(null)}
                                />
                            </div>
                        ) : (
                            <RepositorySnapshotList
                                snapshots={snapshots}
                                showClientColumn={true}
                                onRestore={(snapshot) => setRestoreSnapshot(snapshot)}
                                getClientStatus={(clientId) => clients.find(c => c.id === clientId)?.status || 'offline'}
                                getClientName={(clientId) => {
                                    const client = clients.find(c => c.id === clientId);
                                    return client ? (client.displayName || client.hostname) : null;
                                }}
                            />
                        )
                    )}
                </>
            )}
        </div>
    );
};

