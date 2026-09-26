import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Edit, FileBox, MoreVertical } from 'lucide-react';
import {
    ManagedRepository as Repository,
    CLIENT_STATUS,
    REPOSITORY_STATUS,
} from '@pbcm/shared';
import { Snapshot } from '@pbcm/shared';
import { useState, useEffect } from 'react';
import { SnapshotRestoreEditor } from './SnapshotRestoreEditor';
import { RepositorySnapshotList } from './RepositorySnapshotList';
import {
    ActionButton,
    ActionMenu,
    Badge,
    EntityHeader,
    type EntityDetail,
    StatCard,
    cn,
    useActionMenu,
    FOCUS_RING,
    FOCUS_RING_NONE,
} from '@stefgo/react-ui-components';
import { useRepositorySnapshotStore } from '../../../stores/useRepositorySnapshotStore';
import { useClientStore } from '../../../stores/useClientStore';
import { useAuth } from '../../auth/AuthContext';
import { StatusDot } from '../../clients/components/StatusDot';
import { STATUS_TONE } from '../../clients/components/statusTone';


/**
 * A menu entry marks focus with its background, the way the menu's own entries do -- a ring
 * inside the popover would be clipped by it. Same rule as the client detail page.
 */
const MENU_ENTRY = cn(
    "w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-hover focus-visible:bg-hover flex items-center gap-2",
    FOCUS_RING_NONE,
);

interface RepositoryOverviewProps {
    repo: Repository;
}

export const RepositoryOverview = ({ repo }: RepositoryOverviewProps) => {

    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { isAuthenticated } = useAuth();
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    const [restoreSnapshot, setRestoreSnapshot] = useState<Snapshot | null>(null);

    // Global Store Data
    const { snapshots, isLoading, error, fetchSnapshots } = useRepositorySnapshotStore();
    const { clients, fetchClients } = useClientStore();
    // const { fetchClients } = useClientActions();


    // Fetch Snapshots on mount or repo change
    useEffect(() => {
        if (repo && isAuthenticated) {
            fetchSnapshots(repo);
        }
    }, [repo, isAuthenticated, fetchSnapshots]);

    // Fetch Clients needed for restore if not already loaded
    useEffect(() => {
        if (clients.length === 0 && isAuthenticated) {
            fetchClients();
        }
    }, [clients.length, isAuthenticated, fetchClients]);

    // A fetch in flight reads as "connecting" -- the same amber the list uses for `loading`.
    const statusTone = isLoading
        ? STATUS_TONE.CONNECTING
        : repo?.status === REPOSITORY_STATUS.ONLINE
          ? STATUS_TONE.ONLINE
          : STATUS_TONE.OFFLINE;

    if (!repo) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-error gap-4">
                <AlertCircle size={48} />
                <p>Repository not found</p>
                <button onClick={() => navigate('/')} className={cn("text-info hover:underline rounded-sm", FOCUS_RING)}>Go Back</button>
            </div>
        );
    }

    /**
     * What the header row has no room for, opened on request like the client page's. The
     * secret stays out: the page shows where the repository is and who logs in, not how.
     */
    const details: EntityDetail[] = [
        { label: 'ID', value: String(repo.id), copyable: String(repo.id) },
        { label: 'Server', value: repo.baseUrl },
        { label: 'Datastore', value: repo.datastore },
        { label: 'User', value: repo.username },
        { label: 'Token', value: repo.tokenname || '–' },
    ];

    const showDetails =
        !isLoading && !error && repo.status === REPOSITORY_STATUS.ONLINE;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <EntityHeader
                leading={<StatusDot tone={statusTone} label={isLoading ? REPOSITORY_STATUS.LOADING : repo.status} />}
                title={`${repo.baseUrl}:${repo.datastore}`}
                meta={
                    repo.status === REPOSITORY_STATUS.OFFLINE
                        ? <Badge variant="warning">Offline</Badge>
                        : undefined
                }
                details={details}
                // Names the view, not the repository: one entry for every repository page.
                persist={{ key: 'pbcm.repository.details', scope: 'local' }}
                actions={
                    <div className="relative">
                        <ActionButton
                            icon={MoreVertical}
                            aria-label="Repository actions"
                            onClick={(e) => openMenu(e, String(repo.id))}
                        />
                        <ActionMenu
                            isOpen={menuState?.id === String(repo.id)}
                            onClose={closeMenu}
                            anchor={menuState?.anchor ?? null}
                            triggerRef={triggerRef}
                        >
                            <button
                                onClick={() => {
                                    // `from` is how the editor knows that Cancel returns to
                                    // this page and not to the repository list.
                                    navigate(`/repository/${repo.id}/edit`, {
                                        state: { from: pathname },
                                    });
                                    closeMenu();
                                }}
                                className={MENU_ENTRY}
                            >
                                <Edit size={16} /> Edit Repository
                            </button>
                        </ActionMenu>
                    </div>
                }
            />

            {/* Without this the snapshot fetch could fail and leave nothing but the
                header card on screen, with no hint as to why. */}
            {error && (
                <div className="bg-error-bg text-error p-4 rounded-md flex items-center gap-3">
                    <AlertCircle size={18} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {!isLoading && !error && repo.status !== REPOSITORY_STATUS.ONLINE && (
                <div className="bg-app-bg border border-border text-text-muted p-4 rounded-md flex items-center gap-3">
                    <AlertCircle size={18} className="shrink-0" />
                    <span>Repository is offline — snapshots cannot be listed.</span>
                </div>
            )}

            {/* Stat Cards & Details - Only when online and not loading */}
            {showDetails && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* A count, not a tab: this page shows one list, and a card that
                            switches to the view it is already on only looks like a control. */}
                        <StatCard
                            label="Snapshots"
                            value={snapshots.length.toString()}
                            sub="Available Backups"
                            icon={FileBox}
                            classNames={{ icon: "text-text-muted" }}
                        />
                    </div>

                    {/* Snapshots List OR Restore View */}
                    {restoreSnapshot ? (
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
                            getClientStatus={(clientId) => clients.find(c => c.id === clientId)?.status || CLIENT_STATUS.OFFLINE}
                            getClientName={(clientId) => {
                                const client = clients.find(c => c.id === clientId);
                                return client ? (client.displayName || client.hostname) : null;
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );
};

