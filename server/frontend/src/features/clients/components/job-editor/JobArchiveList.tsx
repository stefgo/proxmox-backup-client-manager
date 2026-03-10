import { Plus, Pencil, Trash2, Folder } from 'lucide-react';
import { useJobFormContext } from '../../context/JobFormContext';


export const JobArchiveList = () => {
    const {
        jobArchives,
        setJobArchives,
        setIsAddingArchive,
        setEditingArchiveIndex,
        setNewItemName,
        setNewItemPath,
        setFileBrowserPath,
        handleEditArchiveItem
    } = useJobFormContext();

    return (
        <div className="flex-1 flex flex-col gap-1 min-h-[200px]">
            <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-gray-500 dark:text-[#888] uppercase">Archives <span className="text-red-500">*</span></label>
                <button onClick={() => { setIsAddingArchive(true); setEditingArchiveIndex(null); setNewItemName(''); setNewItemPath(''); setFileBrowserPath('/'); }} className="text-xs text-[#E54D0D] font-bold hover:underline flex items-center gap-1">
                    <Plus size={12} /> Add Archive
                </button>
            </div>

            <div className="flex-1 border border-gray-200 dark:border-[#333] rounded-lg bg-gray-50 dark:bg-[#111] overflow-y-auto p-2 space-y-2">
                {jobArchives.map((bk, idx) => (
                    <div key={idx} className="bg-app-light dark:bg-[#222] p-3 rounded border border-gray-200 dark:border-[#333] flex justify-between items-center group">
                        <div>
                            <div className="font-bold text-gray-900 dark:text-white text-sm">{bk.name}</div>
                            <div className="text-xs text-blue-500 font-mono mb-1">{bk.path}</div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditArchiveItem(idx)} className="text-gray-400 hover:text-[#E54D0D]">
                                <Pencil size={14} />
                            </button>
                            <button onClick={() => setJobArchives(jobArchives.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-[#E54D0D]">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
                {jobArchives.length === 0 && (
                    <div className="py-2 flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-400">
                        <Folder size={32} className="mb-2" />
                        <div className="text-md">No archives added</div>
                    </div>
                )}
            </div>
        </div>
    );
};
