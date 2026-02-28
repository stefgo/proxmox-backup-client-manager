import { useState } from 'react';
import { HardDrive, Play, MoreVertical, Trash2, Pencil, LayoutList, Table as TableIcon, KeyRound } from 'lucide-react';
import { usePagination } from '../../../hooks/usePagination';
import { PaginationControls } from '../../../components/PaginationControls';
import { formatDate } from '../../../utils';
import { GlobalJob } from '../../../stores/useGlobalJobsStore';

interface GlobalJobListProps {
    jobs: GlobalJob[];
    onEditJob: (job: GlobalJob) => void;
    onTriggerJob: (clientId: string, jobId: string) => void;
    onDeleteJob: (clientId: string, jobId: string) => void;
    getClientStatus: (clientId: string) => 'online' | 'offline';
    getClientName: (clientId: string) => string;
}

export const GlobalJobList = ({ jobs, onEditJob, onTriggerJob, onDeleteJob, getClientStatus, getClientName }: GlobalJobListProps) => {
    const [viewMode, setViewMode] = useState<'table' | 'list'>(() => {
        return (localStorage.getItem('globalJobViewMode') as 'table' | 'list') || 'table';
    });
    const [jobMenuState, setJobMenuState] = useState<{ id: string, clientId: string, x: number, y: number } | null>(null);

    const changeViewMode = (mode: 'table' | 'list') => {
        setViewMode(mode);
        localStorage.setItem('globalJobViewMode', mode);
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

    const formatNextRun = (nextRunAt: string | undefined, isOnline: boolean) => {
        if (!nextRunAt) return <span className="text-gray-500">not defined</span>;
        const date = new Date(nextRunAt);

        if (!isOnline) {
            return <span className="text-gray-400 dark:text-[#666] grayscale">
                {date < new Date() ? 'Pending' : formatDate(date)}
            </span>;
        }

        if (date < new Date()) {
            return <span className="text-orange-500 font-semibold">Pending</span>;
        }

        return <span className="text-green-600 dark:text-green-500">{formatDate(date)}</span>;
    };

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] overflow-hidden shadow-lg flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525]">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <HardDrive size={18} className="text-gray-500 dark:text-[#888]" /> Global Jobs
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
                </div>
            </div>
            <div className="flex-1 overflow-x-auto">
                {viewMode === 'table' ? (
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-[#333]">
                        <thead className="bg-gray-50 dark:bg-[#252525]">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Job Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Job ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Archives</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Schedule</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-[#1e1e1e] divide-y divide-gray-200 dark:divide-[#333]">
                            {currentJobs.map((job) => {
                                const isOnline = getClientStatus(job.clientId) === 'online';
                                const rowClass = isOnline ? 'hover:bg-gray-50 dark:hover:bg-[#252525]' : 'text-gray-400 dark:text-[#666]';

                                return (
                                    <tr key={`${job.clientId}-${job.id}`} className={`transition-colors group ${rowClass}`}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                <div className={`text-sm font-medium ${isOnline ? 'text-gray-900 dark:text-white' : 'text-inherit'} max-w-[150px] truncate`} title={getClientName(job.clientId)}>
                                                    {getClientName(job.clientId)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={`text-sm ${isOnline ? 'font-medium text-gray-900 dark:text-white' : 'text-inherit'}`}>{job.name}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={`text-sm ${isOnline ? 'text-gray-500 dark:text-[#ccc]' : 'text-inherit'}`}>{job.id}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={`text-sm ${isOnline ? 'text-gray-500 dark:text-[#ccc]' : 'text-inherit'}`}>{job.archives?.length || 0}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={`text-sm ${isOnline ? 'text-gray-500 dark:text-[#ccc]' : 'text-inherit'}`}>
                                                {job.scheduleEnabled ? (
                                                    formatNextRun(job.nextRunAt, isOnline)
                                                ) : (
                                                    <span className={isOnline ? "text-gray-400 dark:text-[#555]" : "text-inherit"}>Manual Only</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className={`text-sm ${isOnline ? 'text-gray-500 dark:text-[#ccc]' : 'text-inherit'}`}>
                                                {job.encryption?.enabled && (
                                                    <KeyRound size={16} className={isOnline ? "text-gray-500 dark:text-[#ccc]" : "text-inherit"} />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isOnline) onTriggerJob(job.clientId, job.id);
                                                    }}
                                                    disabled={!isOnline}
                                                    className={`p-1.5 transition-all rounded-full ${isOnline ? 'text-gray-500 hover:text-green-600 dark:text-[#888] dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-[#333]' : 'text-inherit cursor-not-allowed'}`}
                                                    title={isOnline ? "Run Now" : "Client Offline"}
                                                >
                                                    <Play size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (isOnline) onEditJob(job);
                                                    }}
                                                    disabled={!isOnline}
                                                    className={`p-1.5 transition-all rounded-full ${isOnline ? 'text-gray-400 hover:text-blue-600 dark:text-[#666] dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-[#333]' : 'text-inherit cursor-not-allowed'}`}
                                                    title={isOnline ? "Edit Job" : "Client Offline"}
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!isOnline) return;
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setJobMenuState(jobMenuState?.id === job.id && jobMenuState?.clientId === job.clientId ? null : {
                                                                id: job.id,
                                                                clientId: job.clientId,
                                                                x: rect.right,
                                                                y: rect.bottom
                                                            });
                                                        }}
                                                        disabled={!isOnline}
                                                        className={`p-1.5 transition-all rounded-full ${isOnline ? 'text-gray-400 hover:text-gray-600 dark:text-[#666] dark:hover:text-[#ccc] hover:bg-gray-100 dark:hover:bg-[#333]' : 'text-inherit cursor-not-allowed'} ${jobMenuState?.id === job.id && jobMenuState?.clientId === job.clientId ? 'opacity-100' : ''}`}
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>

                                                    {jobMenuState?.id === job.id && jobMenuState?.clientId === job.clientId && isOnline && (
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
                                                                        onDeleteJob(job.clientId, job.id);
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
                                )
                            })}
                            {jobs.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-[#555]">
                                        No jobs configured across any clients
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-[#333]">
                        {currentJobs.map((job) => {
                            const isOnline = getClientStatus(job.clientId) === 'online';
                            const rowClass = isOnline ? 'hover:bg-gray-50 dark:hover:bg-[#252525]' : 'bg-gray-50 dark:bg-[#2a2a2a] text-gray-400 dark:text-[#666] *:[text-gray-400] *:[dark:text-[#666]] opacity-75';

                            return (
                                <div key={`${job.clientId}-${job.id}`} className={`p-5 transition-colors group ${rowClass}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                <span className={`text-xs font-bold ${isOnline ? 'text-gray-500 dark:text-[#888]' : 'text-inherit'} uppercase tracking-wider`}>{getClientName(job.clientId)}</span>
                                            </div>
                                            <h4 className={`text-lg font-bold ${isOnline ? 'text-gray-900 dark:text-white' : 'text-inherit'} mb-2`}>{job.name}</h4>
                                            <div className="space-y-1">
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span className={`font-semibold ${isOnline ? 'text-gray-500 dark:text-[#888]' : 'text-inherit'} min-w-[100px]`}>Job ID:</span>
                                                    <span className={isOnline ? "text-gray-700 dark:text-[#ccc]" : "text-inherit"}>{job.id}</span>
                                                </div>
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span className={`font-semibold ${isOnline ? 'text-gray-500 dark:text-[#888]' : 'text-inherit'} min-w-[100px]`}>Archives:</span>
                                                    <span className={isOnline ? "text-gray-700 dark:text-[#ccc]" : "text-inherit"}>{job.archives?.length || 0}</span>
                                                </div>
                                                <div className="flex items-start gap-2 text-sm">
                                                    <span className={`font-semibold ${isOnline ? 'text-gray-500 dark:text-[#888]' : 'text-inherit'} min-w-[100px]`}>Schedule:</span>
                                                    <span className={isOnline ? "text-gray-700 dark:text-[#ccc]" : "text-inherit"}>
                                                        {job.scheduleEnabled ? (
                                                            formatNextRun(job.nextRunAt, isOnline)
                                                        ) : (
                                                            <span className={isOnline ? "text-gray-400 dark:text-[#555]" : "text-inherit"}>Manual Only</span>
                                                        )}
                                                    </span>
                                                </div>
                                                {job.encryption?.enabled && (
                                                    <div className="flex items-start gap-2 text-sm">
                                                        <span className={`font-semibold ${isOnline ? 'text-gray-500 dark:text-[#888]' : 'text-inherit'} min-w-[100px]`}>Encrypted:</span>
                                                        <span className={`${isOnline ? 'text-gray-700 dark:text-[#ccc]' : 'text-inherit'} flex items-center gap-1`}>
                                                            <KeyRound size={14} className={isOnline ? '' : 'text-inherit'} /> Yes
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isOnline) onTriggerJob(job.clientId, job.id);
                                                }}
                                                disabled={!isOnline}
                                                className={`p-1.5 transition-all rounded-full ${isOnline ? 'text-gray-500 hover:text-green-600 dark:text-[#888] dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-[#333]' : 'text-inherit cursor-not-allowed'}`}
                                                title={isOnline ? "Run Now" : "Client Offline"}
                                            >
                                                <Play size={16} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isOnline) onEditJob(job);
                                                }}
                                                disabled={!isOnline}
                                                className={`p-1.5 transition-all rounded-full ${isOnline ? 'text-gray-400 hover:text-blue-600 dark:text-[#666] dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-[#333]' : 'text-inherit cursor-not-allowed'}`}
                                                title={isOnline ? "Edit Job" : "Client Offline"}
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!isOnline) return;
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setJobMenuState(jobMenuState?.id === job.id && jobMenuState?.clientId === job.clientId ? null : {
                                                            id: job.id,
                                                            clientId: job.clientId,
                                                            x: rect.right,
                                                            y: rect.bottom
                                                        });
                                                    }}
                                                    disabled={!isOnline}
                                                    className={`p-1.5 transition-all rounded-full ${isOnline ? 'text-gray-400 hover:text-gray-600 dark:text-[#666] dark:hover:text-[#ccc] hover:bg-gray-100 dark:hover:bg-[#333]' : 'text-inherit cursor-not-allowed'} ${jobMenuState?.id === job.id && jobMenuState?.clientId === job.clientId ? 'opacity-100' : ''}`}
                                                >
                                                    <MoreVertical size={16} />
                                                </button>

                                                {jobMenuState?.id === job.id && jobMenuState?.clientId === job.clientId && isOnline && (
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
                                                                    onDeleteJob(job.clientId, job.id);
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
                            )
                        })}
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
