import { ChevronRight, Folder, File } from 'lucide-react';
import { useEffect } from 'react';
import { FsFile } from '@pbcm/shared';

interface FileBrowserProps {
    currentPath: string;
    onNavigate: (path: string) => void;
    files: FsFile[];
    isLoading: boolean;

    onSelect: (path: string) => void;
    className?: string;
}

export const FileBrowser = ({ currentPath, onNavigate, files, isLoading, onSelect, className }: FileBrowserProps) => {
    // Sync selectedPath with currentPath on invalidation or navigation
    useEffect(() => {
        onSelect(currentPath);
    }, [currentPath]);

    const goUp = () => {
        const parts = currentPath.split('/').filter(p => p);
        parts.pop();
        onNavigate('/' + (parts.length > 0 ? parts.join('/') : ''));
    }

    return (
        <div className={`border border-gray-200 dark:border-[#333] rounded-lg bg-gray-50 dark:bg-[#111] overflow-hidden flex flex-col ${className}`}>
            <div className="p-3 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-[#333] flex items-center gap-2">
                <button onClick={goUp} className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#333] rounded-full text-gray-500 dark:text-[#888] transition-colors">
                    <ChevronRight className="rotate-180" size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-gray-900 dark:text-white truncate font-medium" title={currentPath}>{currentPath || '/'}</div>
                </div>
            </div>

            <div className="overflow-y-auto p-2 space-y-1 flex-1 min-h-[200px]">
                {isLoading ? (
                    <div className="text-gray-500 dark:text-[#666] text-xs p-4 text-center">Loading...</div>
                ) : (
                    (files && Array.isArray(files) ? files : []).map((file) => (
                        <div key={file.name} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-200 dark:hover:bg-[#222] rounded group">
                            {file.isDirectory ? (
                                <button
                                    onClick={() => onNavigate(file.path)}
                                    className="flex items-center gap-2 flex-1 text-left text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 truncate"
                                >
                                    <Folder size={16} fill="currentColor" className="opacity-20" />
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{file.name}</span>
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 flex-1 text-gray-500 dark:text-[#888] truncate">
                                    <File size={16} />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.name}</span>
                                </div>
                            )}


                        </div>
                    ))
                )}
                {!isLoading && (files && Array.isArray(files) ? files : []).length === 0 && (
                    <div className="text-gray-400 text-xs p-4 text-center">Empty directory</div>
                )}
            </div>
        </div>
    );
};
