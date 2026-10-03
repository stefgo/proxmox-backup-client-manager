/**
 * Every key the cache is addressed by, in one place.
 *
 * The keys are hierarchical on purpose: `invalidateQueries({ queryKey: clients.all })`
 * reaches every entry below it -- a client's jobs, its history, its directory listings --
 * because a key matches whatever it is a prefix of. `queryKeys.test.ts` holds the prefix
 * relations the code relies on.
 */

/** A repository id arrives as a number from SQLite and as a string from the URL. */
type RepositoryId = string | number;

export const queryKeys = {
    repositories: {
        all: ['repositories'] as const,
        list: () => ['repositories', 'list'] as const,
        /** Every repository's status, without the list above it. */
        statuses: () => ['repositories', 'status'] as const,
        status: (id: RepositoryId) => ['repositories', 'status', String(id)] as const,
        /** Every repository's snapshots: what a finished backup makes stale. */
        allSnapshots: () => ['repositories', 'snapshots'] as const,
        snapshots: (id: RepositoryId) => ['repositories', 'snapshots', String(id)] as const,
    },
    clients: {
        all: ['clients'] as const,
        list: () => ['clients', 'list'] as const,
        history: (clientId: string) => ['clients', clientId, 'history'] as const,
        jobs: (clientId: string) => ['clients', clientId, 'jobs'] as const,
        fs: (clientId: string, path: string) => ['clients', clientId, 'fs', path] as const,
        tunnel: (clientId: string) => ['clients', clientId, 'tunnel'] as const,
    },
    jobs: {
        all: ['jobs'] as const,
        list: () => ['jobs', 'list'] as const,
    },
    history: {
        all: ['history'] as const,
        latest: () => ['history', 'latest'] as const,
        /** Every page of the history, whatever its filter: what a run that changed makes stale. */
        lists: () => ['history', 'list'] as const,
        list: (view: { page: number; pageSize: number; status?: string; clientId?: string }) =>
            ['history', 'list', view] as const,
        seen: () => ['history', 'seen'] as const,
    },
    webhooks: {
        all: ['webhooks'] as const,
        list: () => ['webhooks', 'list'] as const,
    },
    settings: {
        all: ['settings'] as const,
        cleanup: () => ['settings', 'cleanup'] as const,
        schedulerStatus: () => ['settings', 'scheduler-status'] as const,
    },
    tokens: {
        all: ['tokens'] as const,
        list: () => ['tokens', 'list'] as const,
    },
    users: {
        all: ['users'] as const,
        list: () => ['users', 'list'] as const,
    },
};
