import type { RouteObject } from 'react-router-dom';
import {
    Activity,
    HardDrive,
    Key,
    LayoutDashboard,
    Monitor,
    Server as ServerIcon,
    Settings as SettingsIcon,
    Users,
    Webhook,
} from 'lucide-react';
import type { DashboardPage } from '@stefgo/react-ui-components';

import { ROUTES } from '../../lib/paths';
import type { TitleHandle } from '../../lib/pageTitle';
import { RouteError } from './RouteError';
import {
    DashboardOverview,
    HistoryOverview,
    ManagedJobs,
    Settings,
    TokenOverview,
    UserOverview,
    WebhookEditorRoute,
    WebhookOverview,
} from './lazyPages';
import {
    AddClientRoute,
    ClientBoundary,
    ClientDetailRoute,
    ClientEditRoute,
    ClientRestoreRoute,
    ClientTunnelRoute,
    ClientsRoute,
    EditJobRoute,
    NewClientJobRoute,
    NewJobRoute,
    NotFound,
    RepositoriesRoute,
    RepositoryBoundary,
    RepositoryDetailRoute,
    RepositoryEditRoute,
    RepositoryNewRoute,
    RepositoryRestoreRoute,
} from './routeElements';

type PageNav = NonNullable<DashboardPage['nav']>;

/**
 * The part of a sidebar entry that is fixed: where it sits and what it is called. What
 * changes while the application runs -- the counts, the dot for unseen failures -- is
 * added by `AppLayout`, by `id`.
 */
export interface NavEntry extends Pick<PageNav, 'label' | 'icon' | 'groupId' | 'placement'> {
    id: string;
}

/**
 * What a route's `handle` may carry. The router types it as `any`; this is what is read.
 * `title` and `subject` are what the document title is made of -- see `lib/pageTitle.ts`.
 */
export interface RouteHandle extends TitleHandle {
    nav?: NavEntry;
}

const nav = (entry: NavEntry): RouteHandle => ({ nav: entry });

/** A route called by a fixed name: a form, mostly. */
const titled = (title: string): RouteHandle => ({ title });

/** The job editor, under a client and under the list across all clients: called by the job's name. */
const JOB: RouteHandle = { subject: 'job', title: 'Job' };

/**
 * Everything inside the dashboard shell, as one tree. It is the only description of what
 * lives where:
 *
 * - **Paths** come from `lib/paths.ts`, each used here exactly once.
 * - **The sidebar** is the areas that carry `handle.nav`, in this order. An entry is
 *   marked while any route below its area is open -- nothing lists those routes again.
 * - **Back** is the parent in this tree (`useBackPath`). Nesting a route decides where its
 *   editor closes onto.
 * - **Not found** is the area's `errorElement`: a boundary below throws `NotFoundError`.
 * - **The document title** is the handles along the open route: the area's label, the
 *   `subject` a route is about, the `title` of a form.
 */
export const shellRoutes: RouteObject[] = [
    {
        path: ROUTES.dashboard,
        handle: nav({ id: 'dashboard', groupId: 'resources', label: 'Dashboard', icon: LayoutDashboard }),
        errorElement: <RouteError />,
        element: <DashboardOverview />,
    },
    {
        path: ROUTES.clients,
        handle: nav({ id: 'clients', groupId: 'resources', label: 'Clients', icon: Monitor }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ClientsRoute /> },
            { path: ROUTES.clientNew, handle: titled('New Client'), element: <AddClientRoute /> },
            {
                path: ROUTES.client,
                handle: { subject: 'client' } satisfies RouteHandle,
                element: <ClientBoundary />,
                children: [
                    { index: true, element: <ClientDetailRoute /> },
                    { path: ROUTES.clientEdit, handle: titled('Edit'), element: <ClientEditRoute /> },
                    { path: ROUTES.clientTunnel, handle: titled('Tunnel'), element: <ClientTunnelRoute /> },
                    { path: ROUTES.clientJobNew, handle: titled('New Job'), element: <NewClientJobRoute /> },
                    { path: ROUTES.clientJob, handle: JOB, element: <EditJobRoute /> },
                    { path: ROUTES.clientRestore, handle: titled('Restore'), element: <ClientRestoreRoute /> },
                ],
            },
        ],
    },
    {
        path: ROUTES.repositories,
        handle: nav({ id: 'repositories', groupId: 'resources', label: 'Repositories', icon: ServerIcon }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <RepositoriesRoute /> },
            { path: ROUTES.repositoryNew, handle: titled('New Repository'), element: <RepositoryNewRoute /> },
            {
                path: ROUTES.repository,
                handle: { subject: 'repository' } satisfies RouteHandle,
                element: <RepositoryBoundary />,
                children: [
                    { index: true, element: <RepositoryDetailRoute /> },
                    { path: ROUTES.repositoryEdit, handle: titled('Edit'), element: <RepositoryEditRoute /> },
                    { path: ROUTES.repositoryRestore, handle: titled('Restore'), element: <RepositoryRestoreRoute /> },
                ],
            },
        ],
    },
    {
        path: ROUTES.jobs,
        handle: nav({ id: 'jobs', groupId: 'resources', label: 'Jobs', icon: HardDrive }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ManagedJobs /> },
            { path: ROUTES.jobNew, handle: titled('New Job'), element: <NewJobRoute /> },
            { path: ROUTES.job, handle: JOB, element: <EditJobRoute /> },
        ],
    },
    {
        path: ROUTES.history,
        handle: nav({ id: 'history', groupId: 'resources', label: 'History', icon: Activity }),
        errorElement: <RouteError />,
        element: <HistoryOverview />,
    },
    {
        path: ROUTES.users,
        handle: nav({ id: 'users', groupId: 'administration', placement: 'mobile-more', label: 'Users', icon: Users }),
        errorElement: <RouteError />,
        element: <UserOverview />,
    },
    {
        path: ROUTES.tokens,
        handle: nav({ id: 'tokens', groupId: 'administration', placement: 'mobile-more', label: 'Client Tokens', icon: Key }),
        errorElement: <RouteError />,
        element: <TokenOverview />,
    },
    {
        path: ROUTES.webhooks,
        handle: nav({ id: 'webhooks', groupId: 'administration', placement: 'mobile-more', label: 'Webhooks', icon: Webhook }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <WebhookOverview /> },
            { path: ROUTES.webhookNew, handle: titled('New Webhook'), element: <WebhookEditorRoute /> },
            // By its kind, not its name: the shell does not read the webhooks, and does not
            // start to for a title.
            { path: ROUTES.webhook, handle: titled('Webhook'), element: <WebhookEditorRoute /> },
        ],
    },
    {
        path: ROUTES.settings,
        handle: nav({ id: 'settings', groupId: 'administration', placement: 'mobile-more', label: 'Settings', icon: SettingsIcon }),
        errorElement: <RouteError />,
        element: <Settings />,
    },
    { path: '*', handle: titled('Not Found'), element: <NotFound /> },
];

/** The sidebar entries, read off the tree: every area with a `handle.nav`, and its path. */
export const navEntries = shellRoutes.flatMap((route) => {
    const entry = (route.handle as RouteHandle | undefined)?.nav;
    return entry && route.path ? [{ ...entry, path: route.path }] : [];
});
