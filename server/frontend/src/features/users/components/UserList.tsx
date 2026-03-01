import { Plus, Trash2, Edit2, User, Key, Globe } from 'lucide-react';
import { formatDate } from '../../../utils';
import { DataTable, ColumnDef } from '../../../components/DataTable';
import { DataTableAction } from '../../../components/DataTableAction';

export interface UserData {
    id: number;
    username: string;
    auth_methods?: string;
    created_at: string;
}

interface UserListProps {
    users: UserData[];
    isLoading: boolean;
    onEditUser: (user: UserData) => void;
    onDeleteUser: (user: UserData) => void;
    onCreateUser: () => void;
}

export const UserList = ({ users, isLoading, onEditUser, onDeleteUser, onCreateUser }: UserListProps) => {
    const renderAuthBadges = (methodsStr?: string) => {
        const methods = methodsStr ? methodsStr.split(',') : ['local'];
        return (
            <div className="flex gap-1">
                {methods.includes('local') && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        <Key size={10} /> Local
                    </span>
                )}
                {methods.includes('oidc') && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50">
                        <Globe size={10} /> OIDC
                    </span>
                )}
            </div>
        );
    };

    const columns: ColumnDef<UserData>[] = [
        {
            header: "User",
            cellClassName: "font-medium text-gray-900 dark:text-white",
            accessorKey: "username"
        },
        {
            header: "Auth",
            accessorFn: (user) => renderAuthBadges(user.auth_methods)
        },
        {
            header: "Created At",
            cellClassName: "text-sm text-gray-500 dark:text-[#666]",
            accessorFn: (user) => formatDate(user.created_at)
        },
        {
            header: "Actions",
            headerClassName: "text-center",
            cellClassName: "text-right text-sm font-medium",
            accessorFn: (user) => (
                <DataTableAction
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
            )
        }
    ];

    return (
        <DataTable
            title="Users"
            icon={<User size={18} />}
            data={users}
            columns={columns}
            keyField="id"
            isLoading={isLoading}
            loadingMessage="Loading users..."
            emptyMessage="No users found"
            actions={
                <button
                    onClick={onCreateUser}
                    className="px-3 py-1 text-white text-xs rounded transition-colors bg-[#E54D0D] hover:bg-[#ff5f1f]"
                >
                    <Plus size={12} className="inline mr-1" /> New User
                </button>
            }
        />
    );
};
