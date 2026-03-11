import { useState, useEffect } from 'react';
import { X, Folder, AlertCircle } from 'lucide-react';
import { Client, ManagedRepository as Repository } from '@pbcm/shared';
import { Snapshot } from '@pbcm/shared';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { FileBrowser } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { ClientSelect } from '../../clients/components/ClientSelect';
import { getErrorMessage } from '../../../utils';

interface SnapshotRestoreEditorProps {
    onCancel: () => void;
    snapshot: Snapshot;
    repo: Repository;
    clients?: Client[];
    selectedClient?: Client;
}

const EMPTY_CLIENTS: Client[] = [];

export const SnapshotRestoreEditor = ({ onCancel, snapshot, repo, clients = EMPTY_CLIENTS, selectedClient }: SnapshotRestoreEditorProps) => {
    const { token } = useAuth();
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedTarget, setSelectedTarget] = useState<string>('');
    const [browserPath, setBrowserPath] = useState('/');
    const [selectedArchives, setSelectedArchives] = useState<string[]>([]);

    const [error, setError] = useState<string | null>(null);

    // Use Global Store for File Browser
    const { fileList, isLoadingFiles, fetchFileList } = useClientFileSystemStore();

    const availableArchives = snapshot.files
        .map(f => f.filename)
        .filter(f => f && (f.endsWith('pxar.didx')))
        .sort();

    // Initialize View State
    useEffect(() => {
        if (snapshot) {
            // If selectedClient is passed, use it directly
            if (selectedClient) {
                setSelectedClientId(selectedClient.id);
            } else if (clients.length > 0) {
                // Try to match client by backup_id
                const match = clients.find(c => c.id === snapshot.backupId);
                if (match) {
                    setSelectedClientId(match.id);
                } else {
                    setSelectedClientId(clients[0].id);
                }
            }

            setSelectedTarget('');
            setBrowserPath('/');
            // Pre-select all archives by default
            const initialArchives = snapshot.files
                .map(f => f.filename)
                .filter(f => f && (f.endsWith('pxar.didx')));
            setSelectedArchives(initialArchives);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot]);

    // Fetch files when path or client changes
    useEffect(() => {
        if (selectedClientId && token) {
            fetchFileList(selectedClientId, browserPath, token);
        }
    }, [selectedClientId, browserPath, token]);

    const handleRestore = async () => {
        setError(null);
        if (!selectedClientId || !selectedTarget || !snapshot || !repo) return;
        if (selectedArchives.length === 0) {
            setError('Please select at least one archive to restore.');
            return;
        }

        try {
            // Format Snapshot ID: type/id/time
            // Time must be ISO format. backup_time is epoch seconds.
            const backupTime = snapshot.backupTime || 0;
            // Remove milliseconds from ISO string (PBS expects YYYY-MM-DDTHH:MM:SSZ)
            const timeStr = new Date(backupTime * 1000).toISOString().split('.')[0] + 'Z';
            const snapshotId = `${snapshot.backupType}/${snapshot.backupId}/${timeStr}`;

            // We need to send the archive name expected by the restore command.
            // Remove .didx, .fidx, .blob suffix
            const sanitizedArchives = selectedArchives.map(a => a.replace(/\.(didx|fidx|blob)$/, ''));

            const res = await fetch(`/api/v1/clients/${selectedClientId}/restore`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    snapshot: snapshotId,
                    targetPath: selectedTarget,
                    repository: repo,
                    archives: sanitizedArchives
                })
            });

            if (!res.ok) {
                const data = await res.json();
                setError('Failed to start restore: ' + (data.error || 'Unknown error'));
            }
        } catch (e: unknown) {
            console.error(e);
            setError('Error triggering restore: ' + getErrorMessage(e));
        }
    };

    if (!snapshot || !repo) return null;

    const toggleArchive = (arch: string) => {
        if (selectedArchives.includes(arch)) {
            setSelectedArchives(selectedArchives.filter(a => a !== arch));
        } else {
            setSelectedArchives([...selectedArchives, arch]);
        }
    };

    const formatArchiveName = (name: string) => {
        // Special handling for pxar: root.pxar.didx -> root
        if (name.endsWith('.pxar.didx')) {
            return name.replace('.pxar.didx', '');
        }
        // General handling: remove index extension
        return name.replace(/\.(didx|fidx|blob)$/, '');
    };

    return (
        <div className="bg-app-card rounded-xl border border-gray-200 dark:border-app-border shadow-premium flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-app-border flex justify-between items-center bg-gray-50 dark:bg-app-input">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-app-text-main flex items-center gap-2">
                        <Folder size={20} className="text-app-accent" /> Restore Snapshot
                    </h3>
                    <div className="text-xs text-gray-500 dark:text-app-text-muted font-mono mt-1">
                        {snapshot.backupType}/{snapshot.backupId} ({snapshot.backupTime ? new Date(snapshot.backupTime * 1000).toLocaleString() : 'Unknown Date'})
                    </div>
                </div>
                <button onClick={onCancel} className="text-gray-500 hover:text-gray-900 dark:text-app-text-muted dark:hover:text-app-text-main p-1 rounded hover:bg-gray-200 dark:hover:bg-app-card transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mx-6 mt-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 gap-6">

                    {/* Step 1: Archives Selection */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Select Archives</label>

                        {availableArchives.length > 0 ? (
                            <div className="border border-gray-200 dark:border-app-border rounded overflow-hidden">
                                {availableArchives.map(arch => (
                                    <label key={arch} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-app-input cursor-pointer border-b last:border-0 border-gray-100 dark:border-app-border">
                                        <input
                                            type="checkbox"
                                            checked={selectedArchives.includes(arch)}
                                            onChange={() => toggleArchive(arch)}
                                            className="custom-checkbox h-4 w-4 bg-gray-100 dark:bg-app-card border-gray-300 dark:border-app-border rounded text-app-accent focus:ring-app-accent"
                                        />
                                        <span className="text-sm font-mono text-gray-700 dark:text-app-text-muted">
                                            {formatArchiveName(arch)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <div className="p-3 text-sm text-gray-500 bg-gray-50 dark:bg-app-input rounded border border-gray-200 dark:border-app-border flex items-center gap-2">
                                <AlertCircle size={16} /> No archives found in this snapshot.
                            </div>
                        )}
                    </div>

                    {/* Step 2: Client Selection (Only if no client pre-selected) */}
                    {!selectedClient && (
                        <ClientSelect
                            clients={clients}
                            selectedClientId={selectedClientId}
                            onSelect={(id) => {
                                setSelectedClientId(id);
                                setBrowserPath('/');
                                setSelectedTarget('');
                            }}
                        />
                    )}

                </div>

                {/* Step 3: Directory Selection */}
                {selectedClientId && (
                    <div className="flex flex-col">
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Target Directory <span className="text-red-500">*</span></label>
                        <FileBrowser
                            currentPath={browserPath}
                            onNavigate={setBrowserPath}
                            files={fileList}
                            isLoading={isLoadingFiles}
                            onSelect={setSelectedTarget}
                            className="flex-1 min-h-[250px] max-h-[300px]"
                        />
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-app-border flex justify-end gap-3 bg-gray-50 dark:bg-app-input">
                <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-200 dark:bg-app-input hover:bg-gray-300 dark:hover:bg-app-card text-gray-800 dark:text-app-text-main font-medium transition-colors">
                    Cancel
                </button>
                <button
                    onClick={handleRestore}
                    disabled={!selectedTarget || !selectedClientId || selectedArchives.length === 0}
                    className="px-4 py-2 rounded bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2 transition-all shadow-glow-accent active:scale-[0.98]"
                >
                    Restore Content
                </button>
            </div>
        </div>
    );
};
