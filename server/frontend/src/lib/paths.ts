import { generatePath } from 'react-router-dom';

/**
 * Every path of the application, once. The route tree in `features/app/routes.tsx` takes
 * its `path`s from here, and whatever navigates takes a pattern (no parameter) or one of
 * the builders in `paths` below. **No path literal anywhere else.**
 *
 * The patterns are absolute, also for a nested route: the tree says who is whose parent,
 * this says what the address bar shows.
 */
export const ROUTES = {
    login: '/login',
    root: '/',

    clients: '/clients',
    clientNew: '/clients/new',
    client: '/clients/:clientId',
    clientEdit: '/clients/:clientId/edit',
    clientTunnel: '/clients/:clientId/tunnel',
    clientJobNew: '/clients/:clientId/jobs/new',
    clientJob: '/clients/:clientId/jobs/:jobId',
    // The backup id is the client's own, so it is not repeated here.
    clientRestore: '/clients/:clientId/restore/:repoId/:backupType/:backupTime',

    repositories: '/repositories',
    repositoryNew: '/repositories/new',
    repository: '/repositories/:repoId',
    repositoryEdit: '/repositories/:repoId/edit',
    repositoryRestore: '/repositories/:repoId/restore/:backupType/:backupId/:backupTime',

    // The job editor a second time, under the list across all clients. Deliberate: the
    // sidebar keeps marking the place the operator came from.
    jobs: '/jobs',
    jobNew: '/jobs/new',
    job: '/jobs/:clientId/:jobId',

    history: '/history',
    users: '/users',
    tokens: '/tokens',

    webhooks: '/webhooks',
    webhookNew: '/webhooks/new',
    webhook: '/webhooks/:webhookId',

    settings: '/settings',
} as const;

type Id = string | number;

/** The patterns with their parameters filled in. A pattern without one is used as it is. */
export const paths = {
    client: (clientId: string) => generatePath(ROUTES.client, { clientId }),
    clientEdit: (clientId: string) => generatePath(ROUTES.clientEdit, { clientId }),
    clientTunnel: (clientId: string) => generatePath(ROUTES.clientTunnel, { clientId }),
    clientJobNew: (clientId: string) => generatePath(ROUTES.clientJobNew, { clientId }),
    clientJob: (clientId: string, jobId: string) => generatePath(ROUTES.clientJob, { clientId, jobId }),
    clientRestore: (clientId: string, repoId: Id, backupType: string, backupTime: number) =>
        generatePath(ROUTES.clientRestore, {
            clientId,
            repoId: String(repoId),
            backupType,
            backupTime: String(backupTime),
        }),

    repository: (repoId: Id) => generatePath(ROUTES.repository, { repoId: String(repoId) }),
    repositoryEdit: (repoId: Id) => generatePath(ROUTES.repositoryEdit, { repoId: String(repoId) }),
    repositoryRestore: (repoId: Id, backupType: string, backupId: string, backupTime: number) =>
        generatePath(ROUTES.repositoryRestore, {
            repoId: String(repoId),
            backupType,
            backupId,
            backupTime: String(backupTime),
        }),

    job: (clientId: string, jobId: string) => generatePath(ROUTES.job, { clientId, jobId }),

    webhook: (webhookId: string) => generatePath(ROUTES.webhook, { webhookId }),
};
