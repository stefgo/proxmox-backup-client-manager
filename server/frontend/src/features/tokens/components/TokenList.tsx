import { Key, Trash2, MoreVertical, Plus } from 'lucide-react';
import { ActionMenu } from '../../../components/ActionMenu';
import { useActionMenu } from '../../../hooks/useActionMenu';
import { Token } from '@pbcm/shared';
import { formatDate } from '../../../utils';
import { usePagination } from '../../../hooks/usePagination';
import { PaginationControls } from '../../../components/PaginationControls';

interface TokenListProps {
    tokens: Token[];
    deleteToken: (token: string) => void;
    generateToken: () => void;
}

export const TokenList = ({ tokens, deleteToken, generateToken }: TokenListProps) => {
    const { menuState, openMenu, closeMenu } = useActionMenu<string>();

    const {
        currentItems: currentTokens,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(tokens, 10);

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#252525] flex justify-between items-center rounded-t-xl">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Key size={18} className="text-gray-500 dark:text-[#888]" /> Client Tokens</h3>
                <button
                    onClick={generateToken}
                    className="px-3 py-1 bg-[#E54D0D] text-white text-xs rounded hover:bg-[#ff5f1f]"
                >
                    <Plus size={12} className="inline mr-1" />Generate New Token
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-[#252525] border-b border-gray-200 dark:border-[#333]">
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Token</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Expires / Used</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-[#333]">
                        {tokens.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-[#666]">
                                    No tokens generated
                                </td>
                            </tr>
                        ) : (
                            currentTokens.map(t => (
                                <tr key={t.token} className="hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`font-mono text-sm text-gray-800 dark:text-[#ccc] ${(t.usedAt || new Date(t.expiresAt) < new Date()) ? 'line-through opacity-60' : ''}`}>
                                            {t.token}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[#666]">
                                        {t.usedAt ? (
                                            <>Used: {formatDate(t.usedAt)}</>
                                        ) : new Date(t.expiresAt) < new Date() ? (
                                            <>Expired: {formatDate(t.expiresAt)}</>
                                        ) : (
                                            <>Expires: {formatDate(t.expiresAt)}</>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {t.usedAt ? (
                                            <span className="text-xs bg-gray-200 text-gray-600 dark:bg-[#333] dark:text-[#888] px-2 py-0.5 rounded">Used</span>
                                        ) : new Date(t.expiresAt) < new Date() ? (
                                            <span className="text-xs bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-500 px-2 py-0.5 rounded">Expired</span>
                                        ) : (
                                            <span className="text-xs bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-500 px-2 py-0.5 rounded">Active</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-2 items-center">
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => openMenu(e, t.token)}
                                                    className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#666] dark:hover:text-[#ccc] transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333] ${menuState?.id === t.token ? 'opacity-100' : ''}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>

                                                <ActionMenu
                                                    isOpen={menuState?.id === t.token}
                                                    onClose={closeMenu}
                                                    position={menuState || { x: 0, y: 0 }}
                                                >
                                                    <button
                                                        onClick={() => {
                                                            deleteToken(t.token);
                                                            closeMenu();
                                                        }}
                                                        className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10"
                                                    >
                                                        <Trash2 size={14} /> Delete Token
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
            <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                onPageChange={goToPage}
                onItemsPerPageChange={setItemsPerPage}
            />
        </div>
    );
};
