import { describe, expect, it } from 'vitest';
import { REPOSITORY_STATUS, RepositoryInputSchema, type ManagedRepository } from '@pbcm/shared';
import { checkDraft, isSameDraft } from '../../../lib/entityForm';
import {
    repositoryDraftFrom,
    repositoryFieldOf,
    repositoryInputFrom,
    repositoryRules,
    storedRepositoryDraft,
    type RepositoryDraft,
} from './repositoryForm';

const stored: ManagedRepository = {
    id: 7,
    baseUrl: 'https://pbs.example.com:8007',
    datastore: 'backups',
    fingerprint: null,
    username: 'root@pam',
    tokenname: null,
    status: Object.values(REPOSITORY_STATUS)[0],
};

const check = (draft: RepositoryDraft, isNew: boolean) =>
    checkDraft(
        {
            schema: RepositoryInputSchema,
            toInput: repositoryInputFrom,
            fieldOf: repositoryFieldOf,
            rules: (d: RepositoryDraft) => repositoryRules(d, isNew),
        },
        draft,
    );

describe('repositoryDraftFrom', () => {
    it('turns the null columns of a stored repository into empty fields', () => {
        expect(repositoryDraftFrom(stored)).toEqual({
            baseUrl: 'https://pbs.example.com:8007',
            datastore: 'backups',
            fingerprint: '',
            username: 'root@pam',
            tokenName: '',
            secret: '',
        });
    });

    it('is empty for a new repository', () => {
        expect(Object.values(repositoryDraftFrom(null)).every((value) => value === '')).toBe(true);
    });
});

describe('repositoryInputFrom', () => {
    it('leaves an empty secret out, so the stored one is kept', () => {
        expect(repositoryInputFrom(repositoryDraftFrom(stored)).secret).toBeUndefined();
    });

    it('leaves a secret of blanks out as well', () => {
        expect(repositoryInputFrom({ ...repositoryDraftFrom(stored), secret: '   ' }).secret).toBeUndefined();
    });

    it('sends a typed secret trimmed', () => {
        expect(repositoryInputFrom({ ...repositoryDraftFrom(stored), secret: ' s3cret ' }).secret).toBe('s3cret');
    });
});

describe('the repository draft, checked', () => {
    it('accepts a stored repository whose secret was left alone', () => {
        expect(check(repositoryDraftFrom(stored), false).isValid).toBe(true);
    });

    it('asks a new repository for every required field, the secret included', () => {
        expect(check(repositoryDraftFrom(null), true).errors).toEqual({
            baseUrl: 'Enter the address of the PBS.',
            datastore: 'Enter the name of the datastore.',
            username: 'Enter the user the token belongs to.',
            secret: 'A new repository needs its secret.',
        });
    });

    it('shows the schema\'s message at a base URL that is none', () => {
        expect(check({ ...repositoryDraftFrom(stored), baseUrl: 'pbs example' }, false).errors).toEqual({
            baseUrl: 'Invalid URL',
        });
    });
});

describe('storedRepositoryDraft', () => {
    it('empties the secret, so the saved form equals the one a reload would show', () => {
        const typed = { ...repositoryDraftFrom(stored), secret: 's3cret' };
        expect(isSameDraft(storedRepositoryDraft(typed), repositoryDraftFrom(stored))).toBe(true);
    });
});
