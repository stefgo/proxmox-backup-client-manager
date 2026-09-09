import { useState } from 'react';
import { FileBrowser, Input, Button, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { useJobFormContext } from '../../context/JobFormContext';


export const JobArchiveEditor = () => {
    const {
        setIsAddingArchive,
        newItemName,
        setNewItemName,
        fileBrowserPath,
        setFileBrowserPath,
        fileList,
        isLoadingFiles,
        newItemPath,
        selectPath,
        addArchiveItem
    } = useJobFormContext();

    const [isNameModified, setIsNameModified] = useState(!!newItemName);

    const handlePathSelect = (path: string) => {
        selectPath(path);
        if (!isNameModified) {
            const parts = path.split('/').filter(Boolean);
            const name = parts.length > 0 ? parts.pop()! : 'Root';
            setNewItemName(name);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 gap-4">
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="field-label">Add Directory</label>
                    <button
                        onClick={() => setIsAddingArchive(false)}
                        className={cn("text-xs text-primary font-bold hover:underline rounded-sm", FOCUS_RING)}
                    >
                        Back
                    </button>
                </div>

                <div className="flex flex-col">
                    <FileBrowser
                        currentPath={fileBrowserPath}
                        onNavigate={setFileBrowserPath}
                        files={fileList}
                        isLoading={isLoadingFiles}
                        onSelect={handlePathSelect}
                        className="flex-1 min-h-[250px] max-h-[300px]"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Input
                    label="Archive Name"
                    type="text"
                    value={newItemName}
                    onChange={(e) => {
                        setNewItemName(e.target.value);
                        setIsNameModified(true);
                    }}
                    placeholder="e.g. Database Dump"
                />

                <Button onClick={addArchiveItem} disabled={!newItemPath} className="w-full shadow-glow-accent">
                    Confirm Archive
                </Button>
            </div>
        </div>
    );
};
