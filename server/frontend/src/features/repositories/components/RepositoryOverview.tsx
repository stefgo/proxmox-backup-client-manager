import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Edit, FileBox, MoreVertical } from 'lucide-react';
import {
    ManagedRepository as Repository,
    CLIENT_STATUS,
    REPOSITORY_STATUS,
} from '@pbcm/shared';
import { Snapshot } from '@pbcm/shared';
import { RepositorySnapshotList } from './RepositorySnapshotList';
import {
    ActionButton,
    ActionMenu,
    Badge,
    EntityHeader,
    MenuItem,
    type EntityDetail,
    StatCard,
    StatusDot,
    useActionMenu,
    Alert,
} from '@stefgo/react-ui-components';
import { useRepositorySnapshots } from '../../../queries/repositories';
import { getErrorMessage } from '../../../utils';
import { useClients } from '../../../queries/clients';
import { STATUS_DOT, STATUS_TONE } from '../../../components/statusTone';
import { paths } from '../../../lib/paths';
import { STORAGE_KEYS } from '../../../lib/storageKeys';


const NO_SNAPSHOTS: Snapshot[] = [];

interface RepositoryOverviewProps {
    repo: Repository;
}

export const RepositoryOverview = ({ repo }: RepositoryOverviewProps) => {

    const navigate = useNavigate();
    const { search } = useLocation();
    const { menuState, triggerRef, openMenu, closeMenu } = useActionMenu<string>();
    // The forms reached from here are routes one level below this page. The query goes
    // along, so closing one comes back to the snapshot list as it was searched.
    const open = (pathname: string) => navigate({ pathname, search });

    // `isPending`, not `isFetching`: a refetch keeps the list it already shows on screen.
    const snapshotQuery = useRepositorySnapshots(repo.id);
    const snapshots = snapshotQuery.data ?? NO_SNAPSHOTS;
    const isLoading = snapshotQuery.isPending;
    const error = snapshotQuery.error ? getErrorMessage(snapshotQuery.error) : null;
    // Which client a snapshot belongs to, and whether it is online.
    const { clients } = useClients();

    // A fetch in flight reads as "connecting" -- the same amber the list uses for `loading`.
    const statusTone = isLoading
        ? STATUS_TONE.CONNECTING
        : repo?.status === REPOSITORY_STATUS.ONLINE
          ? STATUS_TONE.ONLINE
          : STATUS_TONE.OFFLINE;

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
                leading={<StatusDot size="md" {...STATUS_DOT[statusTone]} label={isLoading ? REPOSITORY_STATUS.LOADING : repo.status} />}
                title={`${repo.baseUrl}:${repo.datastore}`}
                meta={
                    repo.status === REPOSITORY_STATUS.OFFLINE
                        ? <Badge variant="warning">Offline</Badge>
                        : undefined
                }
                details={details}
                // Names the view, not the repository: one entry for every repository page.
                persist={{ key: STORAGE_KEYS.repositoryDetails, scope: 'local' }}
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
                            <MenuItem
                                icon={Edit}
                                onClick={() => open(paths.repositoryEdit(repo.id))}
                            >
                                Edit Repository
                            </MenuItem>
                        </ActionMenu>
                    </div>
                }
            />

            {/* Without this the snapshot fetch could fail and leave nothing but the
                header card on screen, with no hint as to why. */}
            {error && <Alert>{error}</Alert>}

            {!isLoading && !error && repo.status !== REPOSITORY_STATUS.ONLINE && (
                <Alert tone="neutral" icon={AlertCircle}>
                    Repository is offline — snapshots cannot be listed.
                </Alert>
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
                            classNames={{ icon: 'text-text-muted' }}
                        />
                    </div>

                    <RepositorySnapshotList
                        snapshots={snapshots}
                        showClientColumn={true}
                        onRestore={(s) =>
                            open(paths.repositoryRestore(repo.id, s.backupType, s.backupId, s.backupTime))
                        }
                        getClientStatus={(clientId) => clients.find(c => c.id === clientId)?.status || CLIENT_STATUS.OFFLINE}
                        getClientName={(clientId) => {
                            const client = clients.find(c => c.id === clientId);
                            return client ? (client.displayName || client.hostname) : null;
                        }}
                    />
                </>
            )}
        </div>
    );
};

