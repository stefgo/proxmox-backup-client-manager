import { ManagedRepository as Repository } from '@pbcm/shared';
import { RepositoryList } from './RepositoryList';
import { useConfirm } from '@stefgo/react-ui-components';
import { describeDeleteRepository } from '../confirmations';

interface ManagedRepositoriesProps {
    repositories: Repository[];
    onSelect: (repo: Repository) => void;
    /** Opens the form for a new repository — its own route, so the URL says what is on screen. */
    onAdd: () => void;
    /** Opens the form for this repository. */
    onEdit: (repo: Repository) => void;
    onDelete: (id: string | number) => Promise<void>;
}

/**
 * The repository list and the one thing only the list does: delete a repository.
 *
 * Adding and editing are routes and therefore navigations, as on the client list. This
 * component used to swap the form in over the list from local state, next to a route that
 * opened the same form from the detail page -- two ways to one form, of which only one
 * survived a reload.
 */
export const ManagedRepositories = ({ repositories, onSelect, onAdd, onEdit, onDelete }: ManagedRepositoriesProps) => {
    const { confirm } = useConfirm();

    // Left open on failure: the message and the button that retries belong together.
    const requestDelete = (repo: Repository) =>
        confirm({ ...describeDeleteRepository(repo), onConfirm: () => onDelete(repo.id) });

    return (
        <div id="managed-repos-section">
            <RepositoryList
                repositories={repositories}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={(id) => {
                    const repo = repositories.find((r) => r.id === id);
                    if (repo) requestDelete(repo);
                }}
                onAdd={onAdd}
            />
        </div>
    );
};
