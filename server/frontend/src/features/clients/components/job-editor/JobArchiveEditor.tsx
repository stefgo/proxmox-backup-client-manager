import { useState } from 'react';
import type { Archive } from '@pbcm/shared';
import { FileBrowser, Input, Button, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { useJobFormContext } from '../../context/JobFormContext';
import { useClientFiles } from '../../../../queries/fileSystem';
import { getDefaultNameFromPath, parentPath, sanitizeArchiveName } from '../../lib/archivePaths';

interface JobArchiveEditorProps {
    /** The archive to change, by its place in the job. `null` adds one. */
    index: number | null;
    /** Back to the form, with the archive taken or not. */
    onDone: () => void;
}

/**
 * One archive: a directory picked in the client's file system, and the name it is stored
 * under. What is typed here belongs to this panel until it is confirmed -- only then does
 * it become part of the job.
 */
export const JobArchiveEditor = ({ index, onDone }: JobArchiveEditorProps) => {
    const { form, clientId } = useJobFormContext();
    const { archives } = form.draft;
    const edited = index !== null ? archives[index] : undefined;

    const [name, setName] = useState(edited?.name ?? '');
    const [path, setPath] = useState(edited?.path ?? '');
    // Always absolute. The agent resolves a relative path against its own working
    // directory, and `.` used to be where an edited job's browser opened.
    const [browserPath, setBrowserPath] = useState(edited ? parentPath(edited.path) : '/');
    const [isNameModified, setIsNameModified] = useState(!!edited?.name);

    const { fileList, isLoadingFiles, error: fileListError } = useClientFiles(clientId, browserPath);

    // The name follows the directory until the operator has typed one of their own.
    const handlePathSelect = (selected: string) => {
        setPath(selected);
        if (!isNameModified) {
            setName(sanitizeArchiveName(selected.split('/').filter(Boolean).pop() ?? 'Root'));
        } else if (!name) {
            setName(getDefaultNameFromPath(selected));
        }
    };

    const confirm = () => {
        if (!path) return;
        const archive: Archive = { path, name: name || getDefaultNameFromPath(path) };
        form.set(
            'archives',
            index !== null ? archives.map((item, i) => (i === index ? archive : item)) : [...archives, archive],
        );
        onDone();
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 gap-4">
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="field-label">Add Directory</label>
                    <button
                        onClick={onDone}
                        className={cn('text-xs text-primary font-bold hover:underline rounded-sm', FOCUS_RING)}
                    >
                        Back
                    </button>
                </div>

                <div className="flex flex-col">
                    <FileBrowser
                        currentPath={browserPath}
                        onNavigate={setBrowserPath}
                        files={fileList}
                        isLoading={isLoadingFiles}
                        onSelect={handlePathSelect}
                        className="flex-1 min-h-[250px] max-h-[300px]"
                    />
                </div>
                {fileListError && <div className="text-xs text-error">{fileListError}</div>}
            </div>

            <div className="space-y-2">
                <Input
                    label="Archive Name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                        setName(sanitizeArchiveName(e.target.value));
                        setIsNameModified(true);
                    }}
                    placeholder="e.g. Database Dump"
                />

                <Button onClick={confirm} disabled={!path} className="w-full shadow-glow-accent">
                    Confirm Archive
                </Button>
            </div>
        </div>
    );
};
