/**
 * Every key the application writes to the browser's storage, once. **No key literal
 * anywhere else**: a key spelled in a component is one nobody finds again, and the names
 * had grown into three schemes that way.
 *
 * A key reads `pbcm.<area>.<what>`. `<area>` is the page or list that owns the value, so
 * the keys of one page sort together in the browser's storage panel; the prefix keeps
 * them apart from whatever else is served from the same origin.
 *
 * Renaming a key forgets what was stored under the old one. That is the whole cost --
 * every value here is a preference that is set again with one click -- so a rename needs
 * no migration.
 */
export const STORAGE_KEYS = {
    // The shell.
    theme: 'pbcm.app.theme',
    ui: 'pbcm.app.ui',
    /** Session storage: when the page last reloaded itself for a chunk that was gone. */
    chunkReloadAt: 'pbcm.app.chunkReloadAt',

    // Lists: table or cards.
    clientsView: 'pbcm.clients.view',
    jobsView: 'pbcm.jobs.view',
    repositoriesView: 'pbcm.repositories.view',
    usersView: 'pbcm.users.view',
    tokensView: 'pbcm.tokens.view',
    webhooksView: 'pbcm.webhooks.view',
    /** One list on two pages, a client's and a repository's, and one setting for both. */
    snapshotsView: 'pbcm.snapshots.view',

    // A client's page: its header and its jobs.
    clientDetails: 'pbcm.client.details',
    clientJobsView: 'pbcm.client.jobsView',

    repositoryDetails: 'pbcm.repository.details',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
