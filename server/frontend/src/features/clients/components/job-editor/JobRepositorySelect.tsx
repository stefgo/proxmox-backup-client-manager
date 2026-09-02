import { useState } from 'react';
import { Trash2, ChevronRight, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import { ManagedRepository as Repository, Repository as JobRepository } from '@pbcm/shared';

const RepositoryInfo = ({ repo }: { repo: JobRepository }) => (
    <div className="px-12 py-3 bg-app-bg text-xs space-y-2 border-t border-border">
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-text-muted">Base URL:</span>
            <span className="text-text-primary break-all">{repo.baseUrl}</span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-text-muted">Datastore:</span>
            <span className="text-text-primary">{repo.datastore}</span>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-text-muted">Username:</span>
            <span className="text-text-primary">{repo.username}</span>
        </div>
        {repo.tokenname && (
            <div className="grid grid-cols-[80px_1fr] gap-2">
                <span className="text-text-muted">Token Name:</span>
                <span className="text-text-primary">{repo.tokenname}</span>
            </div>
        )}
    </div>
);

interface JobRepositorySelectProps {
    repositories: Repository[];
    selectedRepository: JobRepository | null;
    onSelect: (repo: JobRepository | null) => void;
    isSelecting: boolean;
    onSetIsSelecting: (val: boolean) => void;
    label?: string;
}

export const JobRepositorySelect = ({
    repositories,
    selectedRepository,
    onSelect,
    isSelecting,
    onSetIsSelecting,
    label = "Repository"
}: JobRepositorySelectProps) => {
    const [expandedRepoId, setExpandedRepoId] = useState<string | number | null>(null);
    const [isSelectedRepoExpanded, setIsSelectedRepoExpanded] = useState(false);

    const handleSelect = (repo: Repository) => {
        onSelect({
            // Carried into the job so the server can tell which managed repository this
            // copy came from — needed to push an updated fingerprint later.
            repositoryId: String(repo.id),
            baseUrl: repo.baseUrl,
            datastore: repo.datastore,
            fingerprint: repo.fingerprint,
            username: repo.username,
            tokenname: repo.tokenname,
            secret: repo.secret
        });
        onSetIsSelecting(false);
    };

    const toggleExpand = (e: React.MouseEvent, id: string | number) => {
        e.stopPropagation();
        setExpandedRepoId(expandedRepoId === id ? null : id);
    };

    const isCurrentRepo = (repo: Repository) => {
        return selectedRepository?.baseUrl === repo.baseUrl &&
            selectedRepository?.datastore === repo.datastore &&
            selectedRepository?.username === repo.username;
    };

    if (isSelecting) {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-text-muted uppercase">Select Repository</label>
                    <button
                        onClick={() => onSetIsSelecting(false)}
                        className="text-xs text-primary font-bold hover:underline"
                    >
                        Back
                    </button>
                </div>

                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden transition-all">
                    {repositories.map(repo => (
                        <div key={repo.id} className="flex flex-col">
                            <div
                                onClick={() => handleSelect(repo)}
                                className="px-4 py-3 flex items-center justify-between hover:bg-hover cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <button
                                        onClick={(e) => toggleExpand(e, repo.id)}
                                        className="p-1 text-text-muted hover:text-text-secondary"
                                    >
                                        {expandedRepoId === repo.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>

                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {isCurrentRepo(repo) ? (
                                            <CheckCircle2 size={18} className="text-primary flex-shrink-0 animate-pulse-soft" />
                                        ) : (
                                            <Circle size={18} className="text-border flex-shrink-0" />
                                        )}
                                        <div className="font-medium text-sm text-text-primary truncate">
                                            {repo.username}@{repo.baseUrl}:{repo.datastore}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {expandedRepoId === repo.id && (
                                <RepositoryInfo repo={repo} />
                            )}
                        </div>
                    ))}
                    {repositories.length === 0 && (
                        <div className="p-8 text-center text-sm text-text-muted">
                            No repositories configured.
                        </div>
                    )}
                </div>
            </div>
        );
    } else {
        return (
            <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-text-muted uppercase">{label} <span className="text-error">*</span></label>
                    <button onClick={() => onSetIsSelecting(true)} className="text-xs text-primary font-bold hover:underline flex items-center gap-1 transition-colors">
                        {selectedRepository ? 'Change Repository' : 'Set Repository'}
                    </button>
                </div>

                <div className="flex-1 border border-border rounded-lg bg-app-bg overflow-y-auto p-2 space-y-2">
                    {selectedRepository ? (
                        <div className="bg-card border border-border rounded overflow-hidden group transition-all">
                            <div className="flex flex-col">
                                <div className="px-3 py-2 flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <button
                                            onClick={() => setIsSelectedRepoExpanded(!isSelectedRepoExpanded)}
                                            className="p-1 text-text-muted hover:text-text-secondary"
                                        >
                                            {isSelectedRepoExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        <div className="text-sm text-text-primary truncate font-mono tracking-tight opacity-90">
                                            {selectedRepository.username}@{selectedRepository.baseUrl}:{selectedRepository.datastore}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelect(null);
                                            }}
                                            className="p-1 text-text-muted hover:text-primary transition-colors"
                                            title="Clear Selection"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {isSelectedRepoExpanded && (
                                    <RepositoryInfo repo={selectedRepository} />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="px-1 py-2 text-md text-text-muted">No repository selected</div>
                    )}
                </div>
            </div>
        );
    }
};
