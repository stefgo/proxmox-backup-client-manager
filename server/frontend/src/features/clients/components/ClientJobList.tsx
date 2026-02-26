import { useState } from 'react';
import { HardDrive, Plus, Play, MoreVertical, Trash2, Pencil, LayoutList, Table as TableIcon, KeyRound } from 'lucide-react';
import { BackupJob } from '@pbcm/shared';
import { usePagination } from '../../../hooks/usePagination';
import { PaginationControls } from '../../../components/PaginationControls';
import { formatDate } from '../../../utils';

interface ClientJobListProps {
    jobs: BackupJob[];
    onEditJob: (job: BackupJob) => void;
    onTriggerJob: (jobId: string) => void;
    onDeleteJob: (jobId: string) => void;
    onCreateJob: () => void;
}

export const ClientJobList = ({ jobs, onEditJob, onTriggerJob, onDeleteJob, onCreateJob }: ClientJobListProps) => {
    const [viewMode, setViewMode] = useState<'table' | 'list'>(() => {
        return (localStorage.getItem('jobViewMode') as 'table' | 'list') || 'table';
    });
    const [jobMenuState, setJobMenuState] = useState<{ id: string, x: number, y: number } | null>(null);

    const changeViewMode = (mode: 'table' | 'list') => {
        setViewMode(mode);
        localStorage.setItem('jobViewMode', mode);
    };

    const {
        currentItems: currentJobs,
        currentPage,
        totalPages,
        itemsPerPage,
        totalItems,
        goToPage,
        setItemsPerPage
    } = usePagination(jobs, 10);

    // Helper to format execution time and status
    const formatNextRun = (nextRunAt?: string) => {
        if (!nextRunAt) return <span className="text-gray-500">not defined</span>;

        const date = new Date(nextRunAt);
        const now = new Date();

        if (date < now) {
            return <span className="text-orange-500 font-semibold">Pending</span>;
        }

        return <span className="text-green-600 dark:text-green-500">{formatDate(date)}</span>;
    };

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg h-full flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525]">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <HardDrive size={18} className="text-gray-500 dark:text-[#888]" /> Configured Jobs
                </h3>
                <div className="flex items-center gap-3">
                    <div className="bg-gray-200 dark:bg-[#333] rounded-lg p-1 flex items-center gap-1">
                        <button
                            onClick={() => changeViewMode('table')}
                            className={`p-1 rounded transition-all ${viewMode === 'table' ? 'bg-white dark:bg-[#444] shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white'}`}
                            title="Table View"
                        >
                            <TableIcon size={14} />
                        </button>
                        <button
                            onClick={() => changeViewMode('list')}
                            className={`p-1 rounded transition-all ${viewMode === 'list' ? 'bg-white dark:bg-[#444] shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white'}`}
                            title="List View"
                        >
                            <LayoutList size={14} />
                        </button>
                    </div>
                    <button
                        onClick={onCreateJob}
                        className="px-3 py-1 text-white text-xs rounded transition-colors bg-[#E54D0D] hover:bg-[#ff5f1f]"
                    >
                        <Plus size={12} className="inline mr-1" /> New Job
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-x-auto">
                {viewMode === 'table' ? (
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-[#333]">
                        <thead className="bg-gray-50 dark:bg-[#252525]">
                            <tr>
                                {/* Job Name Column */}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Job Name</th>
                                {/* Job ID Column */}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Job ID</th>
                                {/* Archives Count Column */}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Archives</th>
                                {/* Schedule Column */}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Schedule</th>
                                {/* Encrypted Column */}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                                {/* Actions Column (Run, Edit, Delete) */}
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-[#1e1e1e] divide-y divide-gray-200 dark:divide-[#333]">
                            {currentJobs.map((job) => (
                                <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{job.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-[#ccc]">{job.id}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-[#ccc]">{job.archives?.length || 0}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-[#ccc]">
                                            {job.scheduleEnabled ? (
                                                formatNextRun(job.nextRunAt)
                                            ) : (
                                                <span className="text-gray-400 dark:text-[#555]">Manual Only</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-[#ccc]">
                                            {job.encryption?.enabled && (
                                                <KeyRound size={16} className="text-gray-500 dark:text-[#ccc]" />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTriggerJob(job.id);
                                                }}
                                                className="p-1.5 text-gray-500 hover:text-green-600 dark:text-[#888] dark:hover:text-green-400 transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                                                title="Run Now"
                                            >
                                                <Play size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEditJob(job);
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 dark:text-[#666] dark:hover:text-blue-400 transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                                                title="Edit Job"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setJobMenuState(jobMenuState?.id === job.id ? null : {
                                                            id: job.id,
                                                            x: rect.right,
                                                            y: rect.bottom
                                                        });
                                                    }}
                                                    className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#666] dark:hover:text-[#ccc] transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333] ${jobMenuState?.id === job.id ? 'opacity-100' : ''}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>

                                                {jobMenuState?.id === job.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setJobMenuState(null); }} />
                                                        <div
                                                            className="fixed mt-2 w-48 bg-white dark:bg-[#1e1e1e] rounded-md shadow-lg border border-gray-200 dark:border-[#333] z-50 py-1"
                                                            style={{
                                                                top: jobMenuState.y,
                                                                left: jobMenuState.x - 192
                                                            }}
                                                        >
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onDeleteJob(job.id);
                                                                    setJobMenuState(null);
                                                                }}
                                                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                                                            >
                                                                <Trash2 size={14} /> Delete Job
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {jobs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-[#555]">
                                        No jobs configured
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-[#333]">
                        {currentJobs.map((job) => (
                            <div key={job.id} className="p-5 hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors group">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{job.name}</h4>
                                        <div className="space-y-1">
                                            <div className="flex items-start gap-2 text-sm">
                                                <span className="font-semibold text-gray-500 dark:text-[#888] min-w-[100px]">Job ID:</span>
                                                <span className="text-gray-700 dark:text-[#ccc]">{job.id}</span>
                                            </div>
                                            <div className="flex items-start gap-2 text-sm">
                                                <span className="font-semibold text-gray-500 dark:text-[#888] min-w-[100px]">Archives:</span>
                                                <span className="text-gray-700 dark:text-[#ccc]">{job.archives?.length || 0}</span>
                                            </div>
                                            <div className="flex items-start gap-2 text-sm">
                                                <span className="font-semibold text-gray-500 dark:text-[#888] min-w-[100px]">Schedule:</span>
                                                <span className="text-gray-700 dark:text-[#ccc]">
                                                    {job.scheduleEnabled ? (
                                                        formatNextRun(job.nextRunAt)
                                                    ) : (
                                                        <span className="text-gray-400 dark:text-[#555]">Manual Only</span>
                                                    )}
                                                </span>
                                            </div>
                                            {job.encryption?.enabled && (
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span className="font-semibold text-gray-500 dark:text-[#888] min-w-[100px]">Encrypted:</span>
                                                    <span className="text-gray-700 dark:text-[#ccc] flex items-center gap-1">
                                                        <KeyRound size={14} /> Yes
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onTriggerJob(job.id);
                                            }}
                                            className="p-1.5 text-gray-500 hover:text-green-600 dark:text-[#888] dark:hover:text-green-400 transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                                            title="Run Now"
                                        >
                                            <Play size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditJob(job);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:text-[#666] dark:hover:text-blue-400 transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333]"
                                            title="Edit Job"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setJobMenuState(jobMenuState?.id === job.id ? null : {
                                                        id: job.id,
                                                        x: rect.right,
                                                        y: rect.bottom
                                                    });
                                                }}
                                                className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#666] dark:hover:text-[#ccc] transition-all rounded-full hover:bg-gray-100 dark:hover:bg-[#333] ${jobMenuState?.id === job.id ? 'opacity-100' : ''}`}
                                            >
                                                <MoreVertical size={16} />
                                            </button>

                                            {jobMenuState?.id === job.id && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setJobMenuState(null); }} />
                                                    <div
                                                        className="fixed mt-2 w-48 bg-white dark:bg-[#1e1e1e] rounded-md shadow-lg border border-gray-200 dark:border-[#333] z-50 py-1"
                                                        style={{
                                                            top: jobMenuState.y,
                                                            left: jobMenuState.x - 192
                                                        }}
                                                    >
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteJob(job.id);
                                                                setJobMenuState(null);
                                                            }}
                                                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                                                        >
                                                            <Trash2 size={14} /> Delete Job
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {jobs.length === 0 && <div className="p-8 text-center text-[#555]">No jobs configured</div>}
                    </div>
                )}
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
