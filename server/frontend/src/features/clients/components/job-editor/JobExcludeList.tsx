import { Plus, Pencil, Trash2, FolderX } from 'lucide-react';
import { useJobFormContext } from '../../context/JobFormContext';
import { ActionButton, cn, FOCUS_RING } from '@stefgo/react-ui-components';

interface JobExcludeListProps {
    /** Opens the exclusion editor: for the pattern at `index`, or for a new one with `null`. */
    onEdit: (index: number | null) => void;
}

/**
 * The job's exclusions. Optional, unlike the archives above it: a job without any backs
 * up every archive whole, which is what it did before exclusions existed.
 */
export const JobExcludeList = ({ onEdit }: JobExcludeListProps) => {
    const { form } = useJobFormContext();
    const { excludes } = form.draft;

    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-muted uppercase">Exclusions</label>
                <button onClick={() => onEdit(null)} className={cn('text-xs text-primary font-bold hover:underline flex items-center gap-1 transition-colors rounded-sm', FOCUS_RING)}>
                    <Plus size={12} /> Add Exclusion
                </button>
            </div>

            <div className="border rounded-lg bg-app-bg overflow-y-auto p-2 space-y-2">
                {excludes.map((pattern, idx) => (
                    <div key={idx} className="p-3 rounded border flex justify-between items-center transition-all">
                        <div className="text-xs text-primary opacity-80 font-mono break-all">{pattern}</div>
                        <div className="flex items-center gap-2">
                            <ActionButton icon={Pencil} size="sm" color="orange" tooltip="Edit exclusion" onClick={() => onEdit(idx)} />
                            <ActionButton icon={Trash2} size="sm" color="orange" tooltip="Remove exclusion" onClick={() => form.set('excludes', excludes.filter((_, i) => i !== idx))} />
                        </div>
                    </div>
                ))}
                {excludes.length === 0 && (
                    <div className="py-2 flex flex-col items-center justify-center text-text-muted">
                        <FolderX size={24} className="mb-1" />
                        <div className="text-sm">Nothing excluded</div>
                    </div>
                )}
            </div>
            {form.errors.excludes && <p className="mt-1 ml-1 text-xs text-error">{form.errors.excludes}</p>}
        </div>
    );
};
