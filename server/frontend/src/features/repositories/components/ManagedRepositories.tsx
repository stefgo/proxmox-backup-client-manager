import { useState } from 'react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { RepositoryList } from './RepositoryList';
import { RepositoryEditor } from './RepositoryEditor';

interface ManagedRepositoriesProps {
    repositories: Repository[];
    onSelect: (repo: Repository) => void;
    onAdd: (repo: Partial<Repository>) => Promise<void>;
    onUpdate: (id: string | number, repo: Partial<Repository>) => Promise<void>;
    onDelete: (id: string | number) => Promise<void>;
}

export const ManagedRepositories = ({ repositories, onSelect, onAdd, onUpdate, onDelete }: ManagedRepositoriesProps) => {
    const [isCreatingRepo, setIsCreatingRepo] = useState(false);
    const [editingRepo, setEditingRepo] = useState<Repository | null>(null);
    const [isSavingRepo, setIsSavingRepo] = useState(false);

    const handleSaveRepository = async (repoData: Partial<Repository>) => {
        setIsSavingRepo(true);
        try {
            if (editingRepo) {
                await onUpdate(editingRepo.id, repoData);
            } else {
                await onAdd(repoData);
            }
            setIsCreatingRepo(false);
            setEditingRepo(null);
        } catch (e) {
            console.error(e);
            alert('Failed to save repository');
        } finally {
            setIsSavingRepo(false);
        }
    };

    const handleDeleteRepository = async (id: string | number) => {
        if (!confirm('Delete this repository?')) return;
        try {
            await onDelete(id);
        } catch (e) { console.error(e); }
    };

    return (
        <div id="managed-repos-section">
            {isCreatingRepo || editingRepo ? (
                <RepositoryEditor
                    repository={editingRepo}
                    onSave={handleSaveRepository}
                    onCancel={() => { setIsCreatingRepo(false); setEditingRepo(null); }}
                    isSaving={isSavingRepo}
                />
            ) : (
                <RepositoryList
                    repositories={repositories}
                    onSelect={onSelect}
                    onEdit={(repo) => setEditingRepo(repo)}
                    onDelete={handleDeleteRepository}
                    onAdd={() => setIsCreatingRepo(true)}
                />
            )}
        </div>
    );
};
