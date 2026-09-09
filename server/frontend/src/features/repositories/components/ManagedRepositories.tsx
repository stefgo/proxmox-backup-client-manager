import { useState } from 'react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { RepositoryList } from './RepositoryList';
import { RepositoryEditor } from './RepositoryEditor';
import { ConfirmDialog } from '@stefgo/react-ui-components';
import { getErrorMessage } from '../../../utils';

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
    // The repository itself, so the dialog can name it -- one dialog serves every row.
    const [pendingDelete, setPendingDelete] = useState<Repository | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // A failure is deliberately not caught here: the editor shows it in its own footer,
    // beside the fields it belongs to, and keeps the form open with the values intact.
    const handleSaveRepository = async (repoData: Partial<Repository>) => {
        if (editingRepo) {
            await onUpdate(editingRepo.id, repoData);
        } else {
            await onAdd(repoData);
        }
        setIsCreatingRepo(false);
        setEditingRepo(null);
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await onDelete(pendingDelete.id);
            setPendingDelete(null);
        } catch (e) {
            // Left open on purpose: the message and the button that retries belong together.
            alert(getErrorMessage(e));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div id="managed-repos-section">
            {isCreatingRepo || editingRepo ? (
                <RepositoryEditor
                    repository={editingRepo}
                    onSave={handleSaveRepository}
                    onCancel={() => { setIsCreatingRepo(false); setEditingRepo(null); }}
                />
            ) : (
                <RepositoryList
                    repositories={repositories}
                    onSelect={onSelect}
                    onEdit={(repo) => setEditingRepo(repo)}
                    onDelete={(id) => {
                        const repo = repositories.find((r) => r.id === id);
                        if (repo) setPendingDelete(repo);
                    }}
                    onAdd={() => setIsCreatingRepo(true)}
                />
            )}

            {/*
              * A job does not lose its target: BackupJobSchema carries a full copy of the
              * connection, and the agent runs from that copy. What goes is the managed
              * entry -- its status, its snapshot browser, and the template new jobs pick.
              */}
            <ConfirmDialog
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                title={`Delete ${pendingDelete?.baseUrl}:${pendingDelete?.datastore}?`}
                description="Existing jobs keep their own copy of these credentials and go on running. Removed here are the managed entry, its status and its snapshot list -- and it is no longer offered when a job is created."
                confirmLabel="Delete repository"
                variant="danger"
                isConfirming={isDeleting}
            />
        </div>
    );
};
