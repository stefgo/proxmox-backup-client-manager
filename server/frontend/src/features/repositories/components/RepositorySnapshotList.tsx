import { useState } from 'react';
import { FileBox, ArchiveRestore } from 'lucide-react';
import { Snapshot } from '@pbcm/shared';
import { Client } from '@pbcm/shared';
import { PaginationControls } from '../../../components/PaginationControls';
import { formatDate } from '../../../utils';

interface RepositorySnapshotListProps {
    snapshots: Snapshot[];
    clients: Client[];
    onRestore: (snapshot: Snapshot) => void;
}

export const RepositorySnapshotList = ({ snapshots, clients, onRestore }: RepositorySnapshotListProps) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Pagination logic
    const totalItems = snapshots.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedSnapshots = snapshots.slice(startIndex, startIndex + itemsPerPage);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const handleItemsPerPageChange = (size: number) => {
        setItemsPerPage(size);
        setCurrentPage(1); // Reset to first page when page size changes
    };

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg h-full flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525]">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileBox size={18} className="text-gray-500 dark:text-[#888]" /> Snapshots
                </h3>
            </div>

            <div className="flex-1 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[#333]">
                    <thead className="bg-gray-50 dark:bg-[#252525]">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Snapshot</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Size</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-[#1e1e1e] divide-y divide-gray-200 dark:divide-[#333]">
                        {paginatedSnapshots.map((snap) => {
                            const client = clients.find(c => c.id === snap.backupId);
                            return (
                                <tr key={snap.backupTime} className="hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                            {snap.backupType} / {snap.backupId}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {client ? (
                                            <div className="text-sm text-gray-500 dark:text-[#ccc] flex items-center gap-2">
                                                {client.displayName || client.hostname}
                                            </div>
                                        ) : (
                                            <span className="text-sm text-gray-400 dark:text-[#666]">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-[#ccc] flex items-center gap-2">
                                            {formatDate(snap.backupTime * 1000)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-[#ccc]">
                                            {snap.size ? (snap.size / (1024 * 1024)).toFixed(2) + ' MB' : '-'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => onRestore(snap)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:text-[#666] dark:hover:text-blue-400 transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                                            title="Restore Snapshot"
                                        >
                                            <ArchiveRestore size={16} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {snapshots.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-[#555]">
                                    No snapshots found in this repository.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
            />
        </div>
    );
};
