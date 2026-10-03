import type { ManagedRepository, RepositoryInput } from '@pbcm/shared';
import type { FieldErrors, FieldOf } from '../../../lib/entityForm';

/** The repository editor's fields, as typed. */
export interface RepositoryDraft {
    baseUrl: string;
    datastore: string;
    fingerprint: string;
    username: string;
    tokenName: string;
    /**
     * Always starts empty: the secret is never sent to the browser. Typed in, it replaces
     * the stored one; left empty on an existing repository, it keeps it.
     */
    secret: string;
}

/** The draft of a stored repository, or the empty one a new repository starts from. */
export function repositoryDraftFrom(repository?: ManagedRepository | null): RepositoryDraft {
    return {
        baseUrl: repository?.baseUrl || '',
        datastore: repository?.datastore || '',
        fingerprint: repository?.fingerprint || '',
        username: repository?.username || '',
        tokenName: repository?.tokenname || '',
        secret: '',
    };
}

export function repositoryInputFrom(draft: RepositoryDraft): RepositoryInput {
    return {
        baseUrl: draft.baseUrl,
        datastore: draft.datastore,
        fingerprint: draft.fingerprint,
        username: draft.username,
        tokenname: draft.tokenName,
        // Empty means "keep the stored one" -- see RepositoryController.update.
        secret: draft.secret.trim() || undefined,
    };
}

/**
 * The fields that have to be filled, in words. The schema refuses the same drafts, but
 * says "too small" -- and it cannot know that the secret is required only when creating.
 */
export function repositoryRules(draft: RepositoryDraft, isNew: boolean): FieldErrors<RepositoryDraft> {
    const errors: FieldErrors<RepositoryDraft> = {};
    if (!draft.baseUrl.trim()) errors.baseUrl = 'Enter the address of the PBS.';
    if (!draft.datastore.trim()) errors.datastore = 'Enter the name of the datastore.';
    if (!draft.username.trim()) errors.username = 'Enter the user the token belongs to.';
    if (isNew && !draft.secret.trim()) errors.secret = 'A new repository needs its secret.';
    return errors;
}

export const repositoryFieldOf: FieldOf<RepositoryDraft> = (path) => {
    switch (path[0]) {
        case 'baseUrl':
        case 'datastore':
        case 'fingerprint':
        case 'username':
        case 'secret':
            return path[0];
        case 'tokenname':
            return 'tokenName';
        default:
            return null;
    }
};

/** Saved, so nothing is pending any more: the secret field goes back to "unchanged". */
export function storedRepositoryDraft(draft: RepositoryDraft): RepositoryDraft {
    return { ...draft, secret: '' };
}
