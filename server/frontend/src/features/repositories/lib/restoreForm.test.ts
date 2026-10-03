import { describe, expect, it } from 'vitest';
import { RestoreRequestSchema, type Client, type Snapshot } from '@pbcm/shared';
import { checkDraft } from '../../../lib/entityForm';
import {
    archiveLabel,
    initialClientId,
    restorableArchives,
    restoreDraftFrom,
    restoreFieldOf,
    restoreInputFrom,
    restoreRules,
    snapshotPath,
    type RestoreDraft,
} from './restoreForm';

const snapshot: Snapshot = {
    backupType: 'host',
    backupId: 'c1',
    // 2026-01-02T03:04:05Z
    backupTime: 1767323045,
    files: [
        { filename: 'root.pxar.didx' },
        { filename: 'index.json.blob' },
        { filename: 'etc.pxar.didx' },
        { filename: 'catalog.pcat1.didx' },
    ],
};

const client = (id: string, status: 'online' | 'offline' = 'online') => ({ id, hostname: id, status }) as Client;

const draft = (changes: Partial<RestoreDraft> = {}): RestoreDraft => ({
    clientId: 'c1',
    targetPath: '/restore',
    archives: ['etc.pxar.didx', 'root.pxar.didx'],
    useTunnel: true,
    ...changes,
});

/** `null` for a draft whose client id names no client; `undefined` would ask for the default. */
const check = (d: RestoreDraft, chosen: Client | null = client('c1'), tunnelAvailable = false) =>
    checkDraft(
        {
            schema: RestoreRequestSchema,
            toInput: (value: RestoreDraft) => restoreInputFrom(value, { snapshot, repoId: 7, tunnelAvailable }),
            fieldOf: restoreFieldOf,
            rules: (value: RestoreDraft) => restoreRules(value, chosen ?? undefined),
        },
        d,
    );

describe('restorableArchives', () => {
    it('offers the file archives only, by name', () => {
        expect(restorableArchives(snapshot)).toEqual(['etc.pxar.didx', 'root.pxar.didx']);
    });
});

describe('archiveLabel', () => {
    it('names a file archive without its suffixes', () => {
        expect(archiveLabel('root.pxar.didx')).toBe('root');
    });

    it('drops only the index suffix of anything else', () => {
        expect(archiveLabel('catalog.pcat1.didx')).toBe('catalog.pcat1');
    });
});

describe('initialClientId', () => {
    it('is the client the form was opened for', () => {
        expect(initialClientId(snapshot, client('c9'), [client('c1')])).toBe('c9');
    });

    it('is the client the snapshot was taken from', () => {
        expect(initialClientId(snapshot, undefined, [client('c0'), client('c1')])).toBe('c1');
    });

    it('is the first client when the snapshot belongs to none of them', () => {
        expect(initialClientId(snapshot, undefined, [client('c0'), client('c2')])).toBe('c0');
    });

    it('is the fallback when there is no client to choose from', () => {
        expect(initialClientId(snapshot, undefined, [], 'kept')).toBe('kept');
    });
});

describe('restoreDraftFrom', () => {
    it('opens with every archive selected and no target', () => {
        expect(restoreDraftFrom(snapshot, undefined, [client('c1')])).toEqual({
            clientId: 'c1',
            targetPath: '',
            archives: ['etc.pxar.didx', 'root.pxar.didx'],
            useTunnel: true,
        });
    });
});

describe('snapshotPath', () => {
    it('names the snapshot as the PBS does, without milliseconds', () => {
        expect(snapshotPath(snapshot)).toBe('host/c1/2026-01-02T03:04:05Z');
    });
});

describe('restoreInputFrom', () => {
    it('builds the request the server parses', () => {
        const { input, isValid } = check(draft({ targetPath: ' /restore ' }));
        expect(isValid).toBe(true);
        expect(input).toEqual({
            snapshot: 'host/c1/2026-01-02T03:04:05Z',
            targetPath: '/restore',
            repositoryId: '7',
            archives: ['etc.pxar', 'root.pxar'],
            tunnel: undefined,
        });
    });

    it('carries the tunnel choice only for a client that has a tunnel', () => {
        expect(check(draft({ useTunnel: false }), client('c1'), true).input?.tunnel).toEqual({ required: false });
        expect(check(draft({ useTunnel: true }), client('c1'), false).input?.tunnel).toBeUndefined();
    });
});

describe('the restore form, checked', () => {
    it('says at the target why a form that was just opened cannot start', () => {
        const { errors, isValid } = check(draft({ targetPath: '' }));
        expect(isValid).toBe(false);
        expect(errors).toEqual({ targetPath: 'Type the target directory, or pick it below.' });
    });

    it('refuses a typed target that is not absolute, in the schema\'s words', () => {
        expect(check(draft({ targetPath: 'restore' })).errors).toEqual({ targetPath: 'Paths must be absolute' });
    });

    it('asks for an archive', () => {
        expect(check(draft({ archives: [] })).errors).toEqual({ archives: 'Select at least one archive.' });
    });

    it('asks for a client when none is chosen or the chosen one is gone', () => {
        const message = 'Choose the client the restore writes to.';
        expect(check(draft({ clientId: '' }), null).errors).toEqual({ clientId: message });
        expect(check(draft(), null).errors).toEqual({ clientId: message });
    });

    it('refuses an offline client: the restore runs on its agent', () => {
        expect(check(draft(), client('c1', 'offline')).errors).toEqual({
            clientId: 'This client is offline. A restore runs on its agent.',
        });
    });
});
