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
                <label className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase">Archives <span className="text-red-500">*</span></label>
                <button onClick={() => { setIsAddingArchive(true); setEditingArchiveIndex(null); setNewItemName(''); setNewItemPath(''); setFileBrowserPath('/'); }} className="text-xs text-primary font-bold hover:underline flex items-center gap-1 transition-colors">
                    <Plus size={12} /> Add Archive
                </button>
            </div>

            <div className="flex-1 border dark:border-border-dark rounded-lg bg-app-bg dark:bg-app-bg-dark overflow-y-auto p-2 space-y-2">
                {jobArchives.map((bk, idx) => (
                    <div key={idx} className="dark:bg-card-dark p-3 rounded border dark:border-border-dark flex justify-between items-center group transition-all">
                        <div>
                            <div className="font-bold text-text-primary dark:text-text-primary-dark text-sm">{bk.name}</div>
                            <div className="text-xs text-primary opacity-80 font-mono mb-1">{bk.path}</div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditArchiveItem(idx)} className="text-text-muted dark:text-text-muted-dark hover:text-primary transition-colors">
                                <Pencil size={14} />
                            </button>
                            <button onClick={() => setJobArchives(jobArchives.filter((_, i) => i !== idx))} className="text-text-muted dark:text-text-muted-dark hover:text-primary transition-colors">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
                {jobArchives.length === 0 && (
                    <div className="py-2 flex flex-col items-center justify-center h-full text-text-muted dark:text-text-muted-dark">
                        <Folder size={32} className="mb-2" />
                        <div className="text-md">No archives added</div>
                    </div>
                )}
            </div>
        </div>
    );
};
