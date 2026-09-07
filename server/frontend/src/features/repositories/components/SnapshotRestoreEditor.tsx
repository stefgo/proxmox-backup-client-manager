import { useState, useEffect } from 'react';
import { X, Folder, AlertCircle, ShieldCheck } from 'lucide-react';
import { Client, ManagedRepository as Repository } from '@pbcm/shared';
import { Snapshot } from '@pbcm/shared';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { FileBrowser, Button, Checkbox, ActionButton } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { ClientSelect } from '../../clients/components/ClientSelect';
import { getErrorMessage } from '../../../utils';
import { apiFetch } from '../../../lib/apiFetch';

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
    // ClientSelect only opens its list when it is told to. Without this state the
    // "Set Client" button had nothing to call and the preselected client was final.
    const [isSelectingClient, setIsSelectingClient] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<string>('');
    const [browserPath, setBrowserPath] = useState('/');
    const [selectedArchives, setSelectedArchives] = useState<string[]>([]);
    /**
     * Whether this restore reaches the repository through the client's SSH tunnel.
     *
     * Asked here rather than derived from the client, for the same reason a backup job
     * asks it: stored credentials say the detour is *possible*, not that this repository
     * needs it. Defaulted to on, because a client that has a tunnel at all usually has it
     * for want of a direct route — and a restore that cannot reach the PBS is the more
     * expensive mistake of the two.
     */
    const [useTunnel, setUseTunnel] = useState(true);

    const [error, setError] = useState<string | null>(null);
    // A started restore used to leave the form looking untouched, which invites
    // triggering it a second time. The message doubles as the button's lock.
    const [message, setMessage] = useState<string | null>(null);

    // Use Global Store for File Browser
    const { fileList, isLoadingFiles, fetchFileList } = useClientFileSystemStore();

    // The client can still be swapped in the form, so the offer follows the selection and
    // not the client this editor was opened for.
    const restoreClient = selectedClient?.id === selectedClientId
        ? selectedClient
        : clients.find((c) => c.id === selectedClientId);
    const tunnelAvailable = !!restoreClient?.tunnelConfigured;

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
            setUseTunnel(true);
            setIsSelectingClient(false);
            setMessage(null);
            setError(null);
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
            fetchFileList(selectedClientId, browserPath);
        }
    }, [selectedClientId, browserPath, token, fetchFileList]);

    const handleRestore = async () => {
        setError(null);
        setMessage(null);
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

            const res = await apiFetch(`/api/v1/clients/${selectedClientId}/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    snapshot: snapshotId,
                    targetPath: selectedTarget,
                    repository: repo,
                    archives: sanitizedArchives,
                    // Only when it is actually on offer: a client without credentials
                    // would have the request refused for a box it was never shown.
                    tunnel: tunnelAvailable ? { required: useTunnel } : undefined
                })
            });

            if (!res.ok) {
                const data = await res.json();
                setError('Failed to start restore: ' + (data.error || 'Unknown error'));
                return;
            }

            setMessage(
                `Restore of ${sanitizedArchives.length} archive(s) started — follow it in the client's job history.`,
            );
        } catch (e: unknown) {
            console.error(e);
            setError('Error triggering restore: ' + getErrorMessage(e));
        }
    };

    if (!snapshot || !repo) return null;

    const toggleArchive = (arch: string) => {
        setMessage(null);
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
        <div className=" rounded-xl border border-border shadow-premium flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-app-bg">
                <div>
                    <h3 className="font-semibold text-text-primary flex items-center gap-2">
                        <Folder size={20} className="text-text-muted" /> Restore Snapshot
                    </h3>
                    <div className="text-xs text-text-muted font-mono mt-1">
                        {snapshot.backupType}/{snapshot.backupId} ({snapshot.backupTime ? new Date(snapshot.backupTime * 1000).toLocaleString() : 'Unknown Date'})
                    </div>
                </div>
                <ActionButton icon={X} tooltip="Close" onClick={onCancel} />
            </div>

            {message && (
                <div className="mx-6 mt-6 p-3 bg-badge-success-bg border border-success rounded text-success text-sm flex items-center gap-2">
                    <ShieldCheck size={16} className="shrink-0" />
                    {message}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="mx-6 mt-6 p-3 bg-error-bg border border-error rounded text-error text-sm flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 gap-6">

                    {/* Step 1: Archives Selection */}
                    <div>
                        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Select Archives</label>

                        {availableArchives.length > 0 ? (
                            <div className="border border-border rounded overflow-hidden">
                                {availableArchives.map(arch => (
                                    <Checkbox
                                        key={arch}
                                        className="p-2 hover:bg-hover border-b last:border-0 border-border"
                                        // `flex-1` on the label, so the whole row toggles the box
                                        // and not just the words. The row used to be one <label>
                                        // with the padding on it; the label here is a sibling of
                                        // the box inside a flex row, so it has to be told to take
                                        // the rest of the width.
                                        classNames={{ label: 'flex-1 text-sm font-mono text-text-muted' }}
                                        label={formatArchiveName(arch)}
                                        checked={selectedArchives.includes(arch)}
                                        onChange={() => toggleArchive(arch)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="p-3 text-sm text-text-muted bg-app-bg rounded border border-border flex items-center gap-2">
                                <AlertCircle size={16} /> No archives found in this snapshot.
                            </div>
                        )}
                    </div>

                    {/* Step 2: Client Selection (Only if no client pre-selected) */}
                    {!selectedClient && (
                        <ClientSelect
                            clients={clients}
                            selectedClientId={selectedClientId}
                            isSelecting={isSelectingClient}
                            onSetIsSelecting={setIsSelectingClient}
                            onSelect={(id) => {
                                setSelectedClientId(id);
                                setBrowserPath('/');
                                setSelectedTarget('');
                                setMessage(null);
                            }}
                        />
                    )}

                    {/* Only for a client that has credentials. Hidden rather than disabled:
                        a client with no tunnel has no choice to make, and an inert switch
                        would raise a question the operator cannot act on from here. */}
                    {tunnelAvailable && (
                        <Checkbox
                            label="Restore through the SSH reverse tunnel"
                            checked={useTunnel}
                            onChange={() => {
                                setUseTunnel(!useTunnel);
                                setMessage(null);
                            }}
                            classNames={{ label: 'text-sm text-text-muted' }}
                        />
                    )}

                </div>

                {/* Step 3: Directory Selection */}
                {selectedClientId && (
                    <div className="flex flex-col">
                        <label className="block text-xs font-bold text-text-muted uppercase mb-1">Target Directory <span className="text-error">*</span></label>
                        <FileBrowser
                            currentPath={browserPath}
                            onNavigate={setBrowserPath}
                            files={fileList}
                            isLoading={isLoadingFiles}
                            onSelect={(path) => {
                                setSelectedTarget(path);
                                setMessage(null);
                            }}
                            className="flex-1 min-h-[250px] max-h-[300px]"
                        />
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-app-bg">
                <Button variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    onClick={handleRestore}
                    disabled={!selectedTarget || !selectedClientId || selectedArchives.length === 0 || !!message}
                    title={message ? 'Change the selection to start another restore' : undefined}
                >
                    {message ? 'Restore Started' : 'Restore Content'}
                </Button>
            </div>
        </div>
    );
};
