import { FileBrowser, Input, Button, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { useJobFormContext } from '../../context/JobFormContext';

/**
 * One exclusion, typed as a pattern or taken from the file browser.
 *
 * Browsing and choosing are two steps here, unlike in the archive editor. The browser
 * reports every directory it passes through as selected, so taking that as the choice
 * rewrote the pattern on each click -- and the only way to reach a directory was to
 * choose every one on the way. The browser now only moves; the button below it takes
 * the directory it stands in.
 *
 * The browser shows the client's absolute paths, but the CLI reads a pattern relative to
 * the archive root -- so a directory is rebased onto the archive it lies in. The root of
 * an archive and a directory outside every archive have no pattern, and the button says
 * why instead of producing one that would never match.
 */
export const JobExcludeEditor = () => {
    const {
        setIsAddingExclude,
        newExcludePattern,
        setNewExcludePattern,
        fileBrowserPath,
        setFileBrowserPath,
        fileList,
        isLoadingFiles,
        fileListError,
        jobArchives,
        excludePatternFromPath,
        addExcludeItem,
    } = useJobFormContext();

    const normalize = (path: string) => '/' + path.split('/').filter(Boolean).join('/');
    const current = normalize(fileBrowserPath);
    const candidate = excludePatternFromPath(current);
    const isArchiveRoot = jobArchives.some((a) => normalize(a.path) === current);

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 gap-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="field-label">Add Exclusion</label>
                    <button
                        onClick={() => setIsAddingExclude(false)}
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
                        // Navigation is not a choice here -- see above.
                        onSelect={() => {}}
                        className="flex-1 min-h-[250px] max-h-[300px]"
                    />
                </div>
                {fileListError && <div className="text-xs text-error">{fileListError}</div>}

                <div className="flex items-center justify-between gap-3 p-2 border rounded bg-app-bg">
                    <div className="text-xs min-w-0">
                        {candidate !== null ? (
                            <>
                                <span className="text-text-muted">Pattern for this directory: </span>
                                <code className="text-primary break-all">{candidate}</code>
                            </>
                        ) : (
                            <span className="text-text-muted">
                                {isArchiveRoot
                                    ? 'This is the root of an archive — open a directory inside it.'
                                    : 'This directory is outside every archive of this job.'}
                            </span>
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={candidate === null}
                        onClick={() => {
                            if (candidate === null) return;
                            setNewExcludePattern(candidate);
                        }}
                    >
                        Use
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                <Input
                    label="Pattern"
                    type="text"
                    value={newExcludePattern}
                    onChange={(e) => {
                        setNewExcludePattern(e.target.value);
                    }}
                    placeholder="e.g. /stefan/.cache or **/node_modules"
                    classNames={{ input: 'font-mono' }}
                />
                <p className="text-xs text-text-muted">
                    Matched against every archive of the job, relative to the archive's root.
                    A leading <code>/</code> anchors the pattern there; without it, it matches at
                    any depth. <code>*</code> and <code>**</code> work as in <code>.gitignore</code>.
                </p>

                <Button onClick={addExcludeItem} disabled={!newExcludePattern.trim()} className="w-full shadow-glow-accent">
                    Confirm Exclusion
                </Button>
            </div>
        </div>
    );
};
