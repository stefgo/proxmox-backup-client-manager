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
                <label className="text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase">Archives <span className="text-red-500">*</span></label>
                <button onClick={() => { setIsAddingArchive(true); setEditingArchiveIndex(null); setNewItemName(''); setNewItemPath(''); setFileBrowserPath('/'); }} className="text-xs text-app-accent font-bold hover:underline flex items-center gap-1 transition-colors">
                    <Plus size={12} /> Add Archive
                </button>
            </div>

            <div className="flex-1 border border-gray-200 dark:border-app-border rounded-lg bg-gray-50 dark:bg-app-input overflow-y-auto p-2 space-y-2">
                {jobArchives.map((bk, idx) => (
                    <div key={idx} className="bg-app-card p-3 rounded border border-gray-200 dark:border-app-border flex justify-between items-center group transition-all">
                        <div>
                            <div className="font-bold text-gray-900 dark:text-app-text-main text-sm">{bk.name}</div>
                            <div className="text-xs text-app-accent opacity-80 font-mono mb-1">{bk.path}</div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditArchiveItem(idx)} className="text-gray-400 hover:text-app-accent transition-colors">
                                <Pencil size={14} />
                            </button>
                            <button onClick={() => setJobArchives(jobArchives.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-app-accent transition-colors">
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
