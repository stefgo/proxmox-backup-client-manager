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
        if (isLoading) return 'bg-yellow-500 animate-pulse shadow-[0_0_12px_rgba(234,179,8,0.4)]';
        if (repo?.status === 'online') return 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]';
        return 'bg-gray-400 dark:bg-[#444]';
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
            <div className="bg-app-light dark:bg-app-dark rounded-xl border border-gray-200 dark:border-[#333] p-6 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                {repo.baseUrl}:{repo.datastore}
                            </h2>
                            <div className="text-sm font-mono text-gray-500 dark:text-[#666] flex items-center gap-2">
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
                        <div className={activeTab === 'snapshots' ? 'ring-2 ring-blue-500 rounded-xl h-full' : 'h-full'}>
                            <StatCard
                                label="Snapshots"
                                value={snapshots.length.toString()}
                                sub="Available Backups"
                                icon={<FileBox className="text-gray-500 dark:text-[#888]" />}
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
                                clients={clients}
                                onRestore={(snapshot) => setRestoreSnapshot(snapshot)}
                            />
                        )
                    )}
                </>
            )}
        </div>
    );
};

