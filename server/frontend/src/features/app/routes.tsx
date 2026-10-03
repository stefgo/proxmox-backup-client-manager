import { Navigate, type RouteObject } from 'react-router-dom';
import {
    Activity,
    HardDrive,
    Key,
    Monitor,
    Server as ServerIcon,
    Settings as SettingsIcon,
    Users,
    Webhook,
} from 'lucide-react';
import type { DashboardPage } from '@stefgo/react-ui-components';

import { ROUTES } from '../../lib/paths';
import { RouteError } from './RouteError';
import {
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

/** What a route's `handle` may carry. The router types it as `any`; this is what is read. */
export interface RouteHandle {
    nav?: NavEntry;
}

const nav = (entry: NavEntry): RouteHandle => ({ nav: entry });

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
 */
export const shellRoutes: RouteObject[] = [
    { path: ROUTES.root, element: <Navigate to={ROUTES.clients} replace /> },
    {
        path: ROUTES.clients,
        handle: nav({ id: 'clients', groupId: 'resources', label: 'Clients', icon: Monitor }),
        errorElement: <RouteError />,
        children: [
            { index: true, element: <ClientsRoute /> },
            { path: ROUTES.clientNew, element: <AddClientRoute /> },
            {
                path: ROUTES.client,
                element: <ClientBoundary />,
                children: [
                    { index: true, element: <ClientDetailRoute /> },
                    { path: ROUTES.clientEdit, element: <ClientEditRoute /> },
                    { path: ROUTES.clientTunnel, element: <ClientTunnelRoute /> },
                    { path: ROUTES.clientJobNew, element: <NewClientJobRoute /> },
                    { path: ROUTES.clientJob, element: <EditJobRoute /> },
                    { path: ROUTES.clientRestore, element: <ClientRestoreRoute /> },
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
            { path: ROUTES.repositoryNew, element: <RepositoryNewRoute /> },
            {
                path: ROUTES.repository,
                element: <RepositoryBoundary />,
                children: [
                    { index: true, element: <RepositoryDetailRoute /> },
                    { path: ROUTES.repositoryEdit, element: <RepositoryEditRoute /> },
                    { path: ROUTES.repositoryRestore, element: <RepositoryRestoreRoute /> },
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
            { path: ROUTES.jobNew, element: <NewJobRoute /> },
            { path: ROUTES.job, element: <EditJobRoute /> },
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
            { path: ROUTES.webhookNew, element: <WebhookEditorRoute /> },
            { path: ROUTES.webhook, element: <WebhookEditorRoute /> },
        ],
    },
    {
        path: ROUTES.settings,
        handle: nav({ id: 'settings', groupId: 'administration', placement: 'mobile-more', label: 'Settings', icon: SettingsIcon }),
        errorElement: <RouteError />,
        element: <Settings />,
    },
    { path: '*', element: <NotFound /> },
];

/** The sidebar entries, read off the tree: every area with a `handle.nav`, and its path. */
export const navEntries = shellRoutes.flatMap((route) => {
    const entry = (route.handle as RouteHandle | undefined)?.nav;
    return entry && route.path ? [{ ...entry, path: route.path }] : [];
});
