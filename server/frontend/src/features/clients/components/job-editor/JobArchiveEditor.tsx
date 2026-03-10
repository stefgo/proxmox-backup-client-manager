import { useState } from 'react';
import { FileBrowser } from '@stefgo/react-ui-components';
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
                    <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase">Add Directory</label>
                    <button
                        onClick={() => setIsAddingArchive(false)}
                        className="text-xs text-app-accent font-bold hover:underline"
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
                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Archive Name</label>
                    <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => {
                            setNewItemName(e.target.value);
                            setIsNameModified(true);
                        }}
                        placeholder="e.g. Database Dump"
                        className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                    />
                </div>

                <button onClick={addArchiveItem} disabled={!newItemPath} className="w-full py-2 bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 text-white rounded font-bold transition-colors shadow-glow-accent">
                    Confirm Archive
                </button>
            </div>
        </div>
    );
};
