import { useCallback } from 'react';
import { Plus, Trash2, Edit2, User, Key, Globe } from 'lucide-react';
import {
    Badge,
    Button,
    DataAction,
    DataMultiView,
    EmptyState,
    type DataColumnDef,
    PAGE_SIZE,
    listPagination,
    actionsColumn,
    listGroups,
} from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';
import type { User as UserRow } from '@pbcm/shared';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { STORAGE_KEYS } from '../../../lib/storageKeys';

/** One row of `GET /api/v1/users`. */
export type UserData = UserRow;

interface UserListProps {
    users: UserData[];
    isLoading: boolean;
    onEditUser: (user: UserData) => void;
    onDeleteUser: (user: UserData) => void;
    onCreateUser: () => void;
}

const AuthBadges = ({ methods: methodsStr }: { methods?: string | null }) => {
    const methods = methodsStr ? methodsStr.split(',') : ['local'];
    return (
        <div className="flex gap-1">
            {methods.includes('local') && (
                <Badge variant="neutral" className="inline-flex items-center gap-1">
                    <Key size={12} /> Local
                </Badge>
            )}
            {methods.includes('oidc') && (
                <Badge variant="info" className="inline-flex items-center gap-1">
                    <Globe size={12} /> OIDC
                </Badge>
            )}
        </div>
    );
};

/**
 * The accounts that may sign in. Built like every other list of the app -- search in the
 * URL, a list view for narrow screens, the add button in the list's own header -- where it
 * used to be a bare table in a card.
 */
export const UserList = ({ users, isLoading, onEditUser, onDeleteUser, onCreateUser }: UserListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam();

    // Handed to the view instead of applied in front of it: only then can the view tell an
    // empty search from an empty list, and page through what the search left.
    const matchesSearch = useCallback((u: UserData, query: string) => {
        const q = query.toLowerCase();
        return u.username.toLowerCase().includes(q);
    }, []);

    // One set of actions for both views, so the table and the list cannot drift apart.
    const renderActions = (user: UserData) => (
        <div onClick={(e) => e.stopPropagation()}>
            <DataAction
                rowId={user.id}
                actions={[
                    {
                        icon: Edit2,
                        onClick: () => onEditUser(user),
                        color: 'blue',
                        tooltip: 'Edit User',
                    },
                ]}
                menuEntries={[
                    {
                        label: 'Delete User',
                        icon: Trash2,
                        onClick: () => onDeleteUser(user),
                        variant: 'danger',
                        disabled: users.length <= 1,
                        disabledTitle: 'Cannot delete the last user',
                    },
                ]}
            />
        </div>
    );

    const columns: DataColumnDef<UserData>[] = [
        {
            header: 'User',
            accessorKey: 'username',
            sortable: true,
            table: { cellClassName: 'text-sm font-medium text-text-primary' },
            list: { label: null },
            render: (user, view) =>
                view === 'list' ? (
                    <div className="flex items-center gap-2 py-1">
                        <User size={16} className="text-text-muted" />
                        <span className="font-medium text-text-primary">{user.username}</span>
                    </div>
                ) : (
                    user.username
                ),
        },
        {
            header: 'Auth',
            render: (user) => <AuthBadges methods={user.auth_methods} />,
        },
        {
            header: 'Created At',
            sortable: true,
            sortValue: (user) => user.created_at,
            render: (user) => <span className="text-sm text-text-muted">{formatDate(user.created_at)}</span>,
        },
        actionsColumn(renderActions),
    ];

    return (
        <DataMultiView
            title={<><User size={18} className="text-text-muted" /> Users</>}
            extraActions={
                <Button size="sm" icon={Plus} onClick={onCreateUser}>
                    New User
                </Button>
            }
            sort={{ defaultValue: [{ colIndex: 0, direction: 'asc' }] }}
            viewMode={{ persist: { key: STORAGE_KEYS.usersView, scope: 'local' } }}
            data={users}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            isLoading={isLoading}
            loadingMessage="Loading users…"
            searchable
            searchPlaceholder="Search users…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No users match “${searchQuery}”.`}
            emptyMessage={
                <EmptyState
                    icon={User}
                    title="No users found"
                    description="Add a user to give someone access to the dashboard."
                />
            }
            pagination={listPagination(PAGE_SIZE.page)}
        />
    );
};
