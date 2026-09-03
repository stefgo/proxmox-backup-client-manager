import { Plus, Pencil, Trash2, Folder } from 'lucide-react';
import { useJobFormContext } from '../../context/JobFormContext';
import { ActionButton, cn } from '@stefgo/react-ui-components';
import { FOCUS_RING } from '../../../../styles/focus';


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
                <label className="text-xs font-bold text-text-muted uppercase">Archives <span className="text-error">*</span></label>
                <button onClick={() => { setIsAddingArchive(true); setEditingArchiveIndex(null); setNewItemName(''); setNewItemPath(''); setFileBrowserPath('/'); }} className={cn("text-xs text-primary font-bold hover:underline flex items-center gap-1 transition-colors rounded-sm", FOCUS_RING)}>
                    <Plus size={12} /> Add Archive
                </button>
            </div>

            <div className="flex-1 border rounded-lg bg-app-bg overflow-y-auto p-2 space-y-2">
                {jobArchives.map((bk, idx) => (
                    <div key={idx} className=" p-3 rounded border flex justify-between items-center group transition-all">
                        <div>
                            <div className="font-bold text-text-primary text-sm">{bk.name}</div>
                            <div className="text-xs text-primary opacity-80 font-mono mb-1">{bk.path}</div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ActionButton icon={Pencil} size="sm" color="orange" tooltip="Edit archive" onClick={() => handleEditArchiveItem(idx)} />
                            <ActionButton icon={Trash2} size="sm" color="orange" tooltip="Remove archive" onClick={() => setJobArchives(jobArchives.filter((_, i) => i !== idx))} />
                        </div>
                    </div>
                ))}
                {jobArchives.length === 0 && (
                    <div className="py-2 flex flex-col items-center justify-center h-full text-text-muted">
                        <Folder size={32} className="mb-2" />
                        <div className="text-md">No archives added</div>
                    </div>
                )}
            </div>
        </div>
    );
};
