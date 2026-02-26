import { Plus, Trash2, Edit2, User, MoreVertical, Key, Globe } from 'lucide-react';
import { ActionMenu } from '../../../components/ActionMenu';
import { useActionMenu } from '../../../hooks/useActionMenu';
import { formatDate } from '../../../utils';

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
    const { menuState, openMenu, closeMenu } = useActionMenu<number>();

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

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525]">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><User size={18} className="text-gray-500 dark:text-[#888]" /> Users</h3>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCreateUser}
                        className="px-3 py-1 text-white text-xs rounded transition-colors bg-[#E54D0D] hover:bg-[#ff5f1f]"
                    >
                        <Plus size={12} className="inline mr-1" /> New User
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-[#252525] border-b border-gray-200 dark:border-[#333]">
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">User</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Auth</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Created At</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#333]">
                        {isLoading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map(user => (
                                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {renderAuthBadges(user.auth_methods)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[#666]">
                                        {formatDate(user.created_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-2 items-center">
                                            <button
                                                onClick={() => onEditUser(user)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 dark:text-[#666] dark:hover:text-blue-400 transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                                                title="Edit User"
                                            >
                                                <Edit2 size={16} />
                                            </button>

                                            <div className="relative">
                                                <button
                                                    onClick={(e) => openMenu(e, user.id)}
                                                    className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#666] dark:hover:text-[#ccc] transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333] ${menuState?.id === user.id ? 'opacity-100' : ''}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>

                                                <ActionMenu
                                                    isOpen={menuState?.id === user.id}
                                                    onClose={closeMenu}
                                                    position={menuState || { x: 0, y: 0 }}
                                                >
                                                    <button
                                                        onClick={() => {
                                                            onDeleteUser(user);
                                                            closeMenu();
                                                        }}
                                                        disabled={users.length <= 1}
                                                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${users.length <= 1 ? 'text-gray-300 dark:text-[#333] cursor-not-allowed' : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10'} `}
                                                        title={users.length <= 1 ? "Cannot delete the last user" : "Delete User"}
                                                    >
                                                        <Trash2 size={14} /> Delete User
                                                    </button>
                                                </ActionMenu>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
