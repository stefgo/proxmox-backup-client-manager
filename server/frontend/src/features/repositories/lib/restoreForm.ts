import { CLIENT_STATUS, type Client, type RestoreRequest, type Snapshot } from '@pbcm/shared';
import type { FieldErrors, FieldOf } from '../../../lib/entityForm';

/** The restore form's choices, as made. */
export interface RestoreDraft {
    /** The client the restore writes to. Part of the address, not of the request body. */
    clientId: string;
    /** As typed or as picked in the file browser. */
    targetPath: string;
    /** File names as the snapshot lists them, index suffix included. */
    archives: string[];
    /**
     * Whether this restore reaches the repository through the client's SSH tunnel.
     *
     * Asked here rather than derived from the client, for the same reason a backup job
     * asks it: stored credentials say the detour is *possible*, not that this repository
     * needs it. Defaulted to on, because a client that has a tunnel at all usually has it
     * for want of a direct route -- and a restore that cannot reach the PBS is the more
     * expensive mistake of the two.
     */
    useTunnel: boolean;
}

const INDEX_SUFFIX = /\.(didx|fidx|blob)$/;

/** The archives a restore can take from, by name. */
export const restorableArchives = (snapshot: Snapshot): string[] =>
    snapshot.files
        .map((file) => file.filename)
        .filter((name) => name.endsWith('pxar.didx'))
        .sort();

/** An archive as the list names it: `root.pxar.didx` is `root`. */
export const archiveLabel = (filename: string): string =>
    filename.endsWith('.pxar.didx') ? filename.slice(0, -'.pxar.didx'.length) : filename.replace(INDEX_SUFFIX, '');

/**
 * The client a restore of this snapshot starts out with: the one the form was opened
 * for, else the client the snapshot was taken from, else the first one. `fallback` when
 * there is nothing to choose from.
 */
export function initialClientId(
    snapshot: Snapshot,
    selectedClient: Client | undefined,
    clients: Client[],
    fallback = '',
): string {
    if (selectedClient) return selectedClient.id;
    if (clients.length === 0) return fallback;
    return (clients.find((c) => c.id === snapshot.backupId) ?? clients[0]).id;
}

/** The form as it opens: every archive selected, no target yet. */
export function restoreDraftFrom(
    snapshot: Snapshot,
    selectedClient: Client | undefined,
    clients: Client[],
    fallbackClientId = '',
): RestoreDraft {
    return {
        clientId: initialClientId(snapshot, selectedClient, clients, fallbackClientId),
        targetPath: '',
        archives: restorableArchives(snapshot),
        useTunnel: true,
    };
}

/**
 * `<type>/<id>/<time>`, the form the PBS names a snapshot by. `backupTime` is epoch
 * seconds; the PBS expects the time without milliseconds.
 */
export function snapshotPath(snapshot: Snapshot): string {
    const time = new Date((snapshot.backupTime || 0) * 1000).toISOString().split('.')[0] + 'Z';
    return `${snapshot.backupType}/${snapshot.backupId}/${time}`;
}

/** What the request needs and the draft does not hold. */
export interface RestoreSubject {
    snapshot: Snapshot;
    repoId: string | number;
    /** Whether the chosen client has tunnel credentials at all. */
    tunnelAvailable: boolean;
}

export function restoreInputFrom(draft: RestoreDraft, subject: RestoreSubject): RestoreRequest {
    return {
        snapshot: snapshotPath(subject.snapshot),
        targetPath: draft.targetPath.trim(),
        // Named, not described: the server builds the repository, secret included, from
        // the configured one.
        repositoryId: String(subject.repoId),
        // The restore command names an archive without its index suffix.
        archives: draft.archives.map((name) => name.replace(INDEX_SUFFIX, '')),
        // Only when it is actually on offer: a client without credentials would have the
        // request refused for a box it was never shown.
        tunnel: subject.tunnelAvailable ? { required: draft.useTunnel } : undefined,
    };
}

/**
 * What the schema cannot say: it takes an empty archive list, knows no client, and calls
 * an empty target "not absolute". `client` is the chosen one, `undefined` when the id
 * names none.
 */
export function restoreRules(draft: RestoreDraft, client: Client | undefined): FieldErrors<RestoreDraft> {
    const errors: FieldErrors<RestoreDraft> = {};
    if (!draft.clientId || !client) {
        errors.clientId = 'Choose the client the restore writes to.';
    } else if (client.status !== CLIENT_STATUS.ONLINE) {
        errors.clientId = 'This client is offline. A restore runs on its agent.';
    }
    if (draft.archives.length === 0) errors.archives = 'Select at least one archive.';
    if (!draft.targetPath.trim()) errors.targetPath = 'Type the target directory, or pick it below.';
    return errors;
}

export const restoreFieldOf: FieldOf<RestoreDraft> = (path) => {
    switch (path[0]) {
        case 'targetPath':
        case 'archives':
            return path[0];
        case 'tunnel':
            return 'useTunnel';
        default:
            return null;
    }
};
