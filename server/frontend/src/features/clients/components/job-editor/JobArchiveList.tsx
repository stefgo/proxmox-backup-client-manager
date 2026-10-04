import { Plus, Pencil, Trash2, Folder } from 'lucide-react';
import { useJobFormContext } from '../../context/JobFormContext';
import { ActionButton, FormField, cn, FOCUS_RING, FieldLabel } from '@stefgo/react-ui-components';


interface JobArchiveListProps {
    /**
     * Shown without its controls -- while an exclusion is edited, the archives are the
     * reference its pattern is relative to, but opening the archive editor from there
     * would stack two editors on top of each other.
     */
    readOnly?: boolean;
    /** Opens the archive editor: for the archive at `index`, or for a new one with `null`. */
    onEdit?: (index: number | null) => void;
}

export const JobArchiveList = ({ readOnly = false, onEdit }: JobArchiveListProps) => {
    const { form } = useJobFormContext();
    const { archives } = form.draft;

    return (
        <div className={cn('flex-1 flex flex-col gap-1', !readOnly && 'min-h-[200px]')}>
            <div className="flex justify-between items-center">
                <FieldLabel required className="mb-0 ml-0">Archives</FieldLabel>
                {!readOnly && <button onClick={() => onEdit?.(null)} className={cn('text-xs text-primary font-bold hover:underline flex items-center gap-1 transition-colors rounded-sm', FOCUS_RING)}>
                    <Plus size={12} /> Add Archive
                </button>}
            </div>

            {/* No label of its own: the header above carries it, with the action beside it.
                The field is here for the message -- an archive list has no control to hang it on. */}
            <FormField
                error={readOnly ? undefined : form.errors.archives}
                className="flex-1 flex flex-col"
                classNames={{ control: 'flex-1 flex flex-col' }}
            >
                {({ describedBy }) => (
            <div aria-describedby={describedBy} className="flex-1 border rounded-lg bg-app-bg overflow-y-auto p-2 space-y-2">
                {archives.map((bk, idx) => (
                    <div key={idx} className=" p-3 rounded border flex justify-between items-center transition-all">
                        <div>
                            <div className="font-bold text-text-primary text-sm">{bk.name}</div>
                            <div className="text-xs text-primary opacity-80 font-mono mb-1">{bk.path}</div>
                        </div>
                        {!readOnly && <div className="flex items-center gap-2">
                            <ActionButton icon={Pencil} size="sm" color="orange" tooltip="Edit archive" onClick={() => onEdit?.(idx)} />
                            <ActionButton icon={Trash2} size="sm" color="orange" tooltip="Remove archive" onClick={() => form.set('archives', archives.filter((_, i) => i !== idx))} />
                        </div>}
                    </div>
                ))}
                {archives.length === 0 && (
                    <div className="py-2 flex flex-col items-center justify-center h-full text-text-muted">
                        <Folder size={32} className="mb-2" />
                        <div className="text-md">No archives added</div>
                    </div>
                )}
            </div>
                )}
            </FormField>
        </div>
    );
};
