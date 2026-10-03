import { ReactNode, Suspense, lazy, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
    Monitor,
    HardDrive,
    Key,
    Users,
    Settings as SettingsIcon,
    Server as ServerIcon,
    Activity,
    Webhook,
} from 'lucide-react';

// Library Components
import { ConfirmProvider, ConnectionBanner, Dashboard, DashboardNavGroup, DashboardPage, LoadingIndicator, StatusDotProvider, ToastProvider } from '@stefgo/react-ui-components';
import { CLIENT_STATUS, REPOSITORY_STATUS, RepositoryInput } from '@pbcm/shared';

import Login from '../../pages/Login';
import { NotFoundCard } from '../../components/NotFoundCard';
import { ThemeProvider } from './context/ThemeProvider';
import { useTheme } from './context/ThemeContext';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/AuthContext';
import { WebSocketProvider } from './context/WebSocketProvider';
import { useWebSocket } from './context/WebSocketContext';
import { queryClient } from '../../lib/queryClient';

// Hooks & Stores
import { useClient, useClients, useDeleteClient, useUpdateClient } from '../../queries/clients';
import { queryKeys } from '../../lib/queryKeys';
import { useAddRepository, useDeleteRepository, useRepositories, useUpdateRepository } from '../../queries/repositories';
import { useGlobalJobs } from '../../queries/jobs';
import { useUIStore } from '../../stores/useUIStore';
import { useHistorySeenStore } from '../../stores/useHistorySeenStore';
import { useJobResultToasts } from '../../hooks/useJobResultToasts';

// Page components – loaded on demand, so a chunk only arrives when its route does.
const TokenOverview = lazy(() => import('../tokens/components/TokenOverview').then(m => ({ default: m.TokenOverview })));
const ManagedClients = lazy(() => import('../clients/components/ManagedClients').then(m => ({ default: m.ManagedClients })));
const ManagedRepositories = lazy(() => import('../repositories/components/ManagedRepositories').then(m => ({ default: m.ManagedRepositories })));
const ManagedJobs = lazy(() => import('../jobs/components/ManagedJobs').then(m => ({ default: m.ManagedJobs })));
const HistoryOverview = lazy(() => import('../history/components/HistoryOverview').then(m => ({ default: m.HistoryOverview })));
const ClientOverview = lazy(() => import('../clients/components/ClientOverview').then(m => ({ default: m.ClientOverview })));
const AddClientWizard = lazy(() => import('../clients/components/add-client/AddClientWizard').then(m => ({ default: m.AddClientWizard })));
const ClientEditor = lazy(() => import('../clients/components/ClientEditor').then(m => ({ default: m.ClientEditor })));
const ClientTunnelEditor = lazy(() => import('../clients/components/ClientTunnelEditor').then(m => ({ default: m.ClientTunnelEditor })));
const JobEditorPage = lazy(() => import('../jobs/components/JobEditorPage').then(m => ({ default: m.JobEditorPage })));
const RepositoryOverview = lazy(() => import('../repositories/components/RepositoryOverview').then(m => ({ default: m.RepositoryOverview })));
const RepositoryEditor = lazy(() => import('../repositories/components/RepositoryEditor').then(m => ({ default: m.RepositoryEditor })));
const UserOverview = lazy(() => import('../users/components/UserOverview').then(m => ({ default: m.UserOverview })));
const Settings = lazy(() => import('../../pages/Settings'));
const WebhookOverview = lazy(() => import('../webhooks/components/WebhookOverview').then(m => ({ default: m.WebhookOverview })));
const WebhookEditorRoute = lazy(() => import('../webhooks/components/WebhookEditor').then(m => ({ default: m.WebhookEditorRoute })));

interface ProtectedRouteProps {
    children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

// ---------------------------------------------------------------------------
// Routes
//
// Each route pulls what it needs from the stores itself. AppLayout used to hold
// the selected client and repository for every page at once; now only the route
// that shows them does.
// ---------------------------------------------------------------------------

function ClientsRoute() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { clients, refetch } = useClients();
    const { mutateAsync: deleteClient } = useDeleteClient();

    // Every editor route knows where back is because the surface that opened it says so.
    const open = (to: string) => navigate(to, { state: { from: pathname } });

    return (
        <ManagedClients
            clients={clients}
            onSelect={(c) => (c ? navigate(`/client/${c.id}`) : navigate('/'))}
            onRefresh={refetch}
            onDelete={deleteClient}
            onAdd={() => open('/clients/new')}
            onEdit={(c) => open(`/client/${c.id}/edit`)}
            onEditTunnel={(c) => open(`/client/${c.id}/tunnel`)}
        />
    );
}

function AddClientRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const back = (location.state as { from?: string } | null)?.from ?? '/clients';

    return (
        <AddClientWizard
            onClose={() => navigate(back)}
            onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.clients.list() })}
        />
    );
}

/**
 * The client routes below resolve the client from the cached list. While that is pending
 * they show the spinner: a reloaded or shared URL renders before the first fetch returns,
 * and an empty list then says nothing about whether the client exists. Only after that is
 * a missing client really gone -- a stale bookmark or a deleted client gets the not-found
 * card, and the URL stays where it was.
 */
function useRouteClient() {
    const { clientId } = useParams();
    const { isPending } = useClients();
    const client = useClient(clientId);
    return { client, isPending };
}

function ClientMissing({ isPending }: { isPending: boolean }) {
    if (isPending) return <LoadingIndicator label="Loading client…" />;

    return (
        <NotFoundCard title="Client not found" backTo="/clients" backLabel="Back to clients">
            There is no client with this ID. It may have been deleted.
        </NotFoundCard>
    );
}

function ClientDetailRoute() {
    const { client, isPending } = useRouteClient();
    if (!client) return <ClientMissing isPending={isPending} />;

    return <ClientOverview client={client} />;
}

function ClientEditRoute() {
    const { client, isPending } = useRouteClient();
    const { mutateAsync: updateClient } = useUpdateClient();
    if (!client) return <ClientMissing isPending={isPending} />;

    return <ClientEditor client={client} onSave={(clientId, data) => updateClient({ clientId, data })} />;
}

function ClientTunnelRoute() {
    const { client, isPending } = useRouteClient();
    if (!client) return <ClientMissing isPending={isPending} />;

    return <ClientTunnelEditor client={client} />;
}

/**
 * The job editor sits under two path families for the same page: under the client when it
 * was opened from there, under `/jobs` when it was opened from the list across all clients.
 * The sidebar then keeps marking the place the operator came from, and both URLs stay
 * honest about what they show.
 *
 * Creating is the only case where the client is open to choice, and only from `/jobs/new`:
 * a job is saved through `POST /api/v1/clients/:clientId/jobs`, so an existing one cannot
 * change hands, and one started from a client already has its answer.
 */
function NewClientJobRoute() {
    const { client, isPending } = useRouteClient();
    if (!client) return <ClientMissing isPending={isPending} />;

    return <JobEditorPage lockedClientId={client.id} fallbackBack={`/client/${client.id}`} />;
}

function NewJobRoute() {
    return <JobEditorPage fallbackBack="/jobs" />;
}

/**
 * Resolves the job to edit from the list that holds every client's jobs.
 *
 * A directly opened URL renders before that list has answered, and "the list is empty"
 * alone cannot tell a pending fetch from a deleted job. Only once it is no longer pending
 * is a missing job really gone.
 */
function EditJobRoute({ fallback }: { fallback: (clientId: string) => string }) {
    const { clientId, jobId } = useParams();
    const { jobs: globalJobs, isPending } = useGlobalJobs();

    const job = globalJobs.find((j) => j.clientId === clientId && j.id === jobId);
    if (!job) {
        if (isPending) return <LoadingIndicator label="Loading job…" />;

        return (
            <NotFoundCard title="Job not found" backTo="/jobs" backLabel="Back to jobs">
                There is no job with this ID on this client. It may have been deleted.
            </NotFoundCard>
        );
    }

    return <JobEditorPage lockedClientId={job.clientId} job={job} fallbackBack={fallback(job.clientId)} />;
}

function RepositoriesRoute() {
    const navigate = useNavigate();
    const { repositories } = useRepositories();
    const { mutateAsync: addRepository } = useAddRepository();
    const { mutateAsync: updateRepository } = useUpdateRepository();
    const { mutateAsync: deleteRepository } = useDeleteRepository();

    return (
        <ManagedRepositories
            repositories={repositories}
            onSelect={(r) => (r ? navigate(`/repository/${r.id}`) : navigate('/'))}
            onAdd={addRepository}
            onUpdate={(id, repo) => updateRepository({ id, repo })}
            onDelete={deleteRepository}
        />
    );
}

/** Same waiting and not-found handling as `useRouteClient`, for the repository routes. */
function useRouteRepository() {
    const { repoId } = useParams();
    const { repositories, isPending } = useRepositories();
    const repo = repositories.find((r) => String(r.id) === repoId);
    return { repoId, repo, isPending };
}

function RepositoryMissing({ isPending }: { isPending: boolean }) {
    if (isPending) return <LoadingIndicator label="Loading repository…" />;

    return (
        <NotFoundCard title="Repository not found" backTo="/repositories" backLabel="Back to repositories">
            There is no repository with this ID. It may have been deleted.
        </NotFoundCard>
    );
}

function RepositoryDetailRoute() {
    const { repo, isPending } = useRouteRepository();
    if (!repo) return <RepositoryMissing isPending={isPending} />;

    return <RepositoryOverview repo={repo} />;
}

/**
 * Editing from the detail page needs a URL of its own: the list keeps its editor in local
 * state, which nothing outside `ManagedRepositories` can reach. `from` carries the page the
 * menu was opened on, so Cancel returns there instead of always falling back to the list.
 */
function RepositoryEditRoute() {
    const { repoId, repo, isPending } = useRouteRepository();
    const navigate = useNavigate();
    const { state } = useLocation();
    const { mutateAsync: updateRepository } = useUpdateRepository();

    const back = (state as { from?: string } | null)?.from ?? `/repository/${repoId}`;

    if (!repo) return <RepositoryMissing isPending={isPending} />;

    return (
        <RepositoryEditor
            repository={repo}
            // Errors are not caught here: like the client editor, the form stays open and
            // reports in its own footer. Saving does not navigate away either -- the page
            // says "Repository saved" and the operator decides when to leave.
            onSave={(data: RepositoryInput) => updateRepository({ id: repo.id, repo: data })}
            onCancel={() => navigate(back)}
        />
    );
}

function NotFound() {
    const { pathname } = useLocation();

    return (
        <NotFoundCard title="Page not found" backTo="/clients" backLabel="Back to clients">
            There is nothing at <code className="font-mono text-sm">{pathname}</code>.
        </NotFoundCard>
    );
}

function AppLayout() {
    const { isAuthenticated, username, logout } = useAuth();
    const connection = useWebSocket();
    const isLost = connection?.isLost ?? false;
    const resyncKey = connection?.resyncKey ?? 0;
    const navigate = useNavigate();
    const location = useLocation();

    const { theme, toggleTheme } = useTheme();
    const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

    const path = location.pathname;

    const { clients } = useClients();
    const { repositories: repos } = useRepositories();
    const { jobs: globalJobs } = useGlobalJobs();
    const fetchSeen = useHistorySeenStore((s) => s.fetchSeen);
    // Not on the history page itself: what fails there is in view as it arrives.
    const unseenFailures = useHistorySeenStore((s) => s.unseenFailed > 0) && path !== '/history';

    // In the shell rather than a page: a run outlives the page it was started from.
    useJobResultToasts();

    // Initial fetch, and again after a reconnect: what the server pushed while the socket
    // was down is lost, and only CLIENTS_UPDATE is sent again on connect.
    useEffect(() => {
        if (isAuthenticated) {
            fetchSeen();
        }
    }, [isAuthenticated, resyncKey, fetchSeen]);

    // Stats
    const stats = useMemo(
        () => ({
            clients: {
                active: clients.filter((c) => c.status === CLIENT_STATUS.ONLINE).length,
                total: clients.length,
            },
            repositories: {
                active: repos.filter((r) => r.status === REPOSITORY_STATUS.ONLINE).length,
                total: repos.length,
            },
            // Only the active count: the total counted the same cache, so on an
            // offline client both halves read the same number and said nothing.
            jobs: {
                active: globalJobs.filter((j) => {
                    const client = clients.find((c) => c.id === j.clientId);
                    return client?.status === CLIENT_STATUS.ONLINE;
                }).length,
            },
        }),
        [clients, repos, globalJobs],
    );

    // Comes from /api/v1/me now. It used to be base64-decoded out of the JWT here, which
    // the page cannot do any more — and should not: the name belongs to the server that
    // issued the session, not to a payload the browser takes apart itself.
    const displayName = username ?? 'User';

    const logo = (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white leading-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <path d="M12 12v-4" />
                <path d="M12 12l2-2" />
                <path d="M12 12l-2-2" />
            </svg>
        </div>
    );

    const title = (
        <div className="flex flex-col">
            <h1 className="text-xl font-bold text-text-primary leading-tight">P<span className="text-primary">BC</span>M</h1>
            <span className="pt-1 text-[10px] font-mono text-text-muted -mt-1 leading-none">
                {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
            </span>
        </div>
    );

    const navGroups: DashboardNavGroup[] = [
        { id: 'resources', title: 'Resources' },
        { id: 'administration', title: 'Administration' },
    ];

    // Navigation only – the routes below decide what is rendered.
    const pages: DashboardPage[] = useMemo(() => [
        {
            id: 'clients',
            path: [
                '/', '/clients', '/clients/new',
                '/client/:clientId', '/client/:clientId/edit', '/client/:clientId/tunnel',
                '/client/:clientId/jobs/new', '/client/:clientId/jobs/:jobId',
            ],
            nav: {
                groupId: 'resources',
                label: 'Clients',
                icon: Monitor,
                badge: `${stats.clients.active} / ${stats.clients.total}`,
                onClick: () => navigate('/clients'),
            },
        },
        {
            id: 'repositories',
            path: ['/repositories', '/repository/:repoId', '/repository/:repoId/edit'],
            nav: {
                groupId: 'resources',
                label: 'Repositories',
                icon: ServerIcon,
                badge: `${stats.repositories.active} / ${stats.repositories.total}`,
                onClick: () => navigate('/repositories'),
            },
        },
        {
            id: 'jobs',
            path: ['/jobs', '/jobs/new', '/jobs/:clientId/:jobId'],
            nav: {
                groupId: 'resources',
                label: 'Jobs',
                icon: HardDrive,
                badge: `${stats.jobs.active}`,
                onClick: () => navigate('/jobs'),
            },
        },
        {
            id: 'history',
            path: '/history',
            nav: {
                groupId: 'resources',
                label: 'History',
                icon: Activity,
                badgeDot: unseenFailures,
                badgeTone: unseenFailures ? 'error' : undefined,
                onClick: () => navigate('/history'),
            },
        },
        {
            id: 'users',
            path: '/users',
            nav: {
                groupId: 'administration',
                placement: 'mobile-more',
                label: 'Users',
                icon: Users,
                onClick: () => navigate('/users'),
            },
        },
        {
            id: 'tokens',
            path: '/tokens',
            nav: {
                groupId: 'administration',
                placement: 'mobile-more',
                label: 'Client Tokens',
                icon: Key,
                onClick: () => navigate('/tokens'),
            },
        },
        {
            id: 'webhooks',
            path: ['/webhooks', '/webhooks/new', '/webhooks/:webhookId'],
            nav: {
                groupId: 'administration',
                placement: 'mobile-more',
                label: 'Webhooks',
                icon: Webhook,
                onClick: () => navigate('/webhooks'),
            },
        },
        {
            id: 'settings',
            path: '/settings',
            nav: {
                groupId: 'administration',
                placement: 'mobile-more',
                label: 'Settings',
                icon: SettingsIcon,
                onClick: () => navigate('/settings'),
            },
        },
    ], [stats, navigate, unseenFailures]);

    return (
        // While the socket is lost, no status dot pulses: nothing is watching those states.
        <StatusDotProvider live={!isLost}>
            <Dashboard
                banner={<ConnectionBanner connected={!isLost} />}
                logo={logo}
                title={title}
                username={displayName}
                onLogout={logout}
                theme={theme}
                onToggleTheme={toggleTheme}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={toggleSidebarCollapsed}
                pages={pages}
                navGroups={navGroups}
                currentPath={path}
            >
                <Suspense fallback={<LoadingIndicator />}>
                    <Routes>
                        <Route path="/" element={<ClientsRoute />} />
                        <Route path="/clients" element={<ClientsRoute />} />
                        <Route path="/clients/new" element={<AddClientRoute />} />
                        <Route path="/client/:clientId" element={<ClientDetailRoute />} />
                        <Route path="/client/:clientId/edit" element={<ClientEditRoute />} />
                        <Route path="/client/:clientId/tunnel" element={<ClientTunnelRoute />} />
                        <Route path="/client/:clientId/jobs/new" element={<NewClientJobRoute />} />
                        <Route
                            path="/client/:clientId/jobs/:jobId"
                            element={<EditJobRoute fallback={(clientId) => `/client/${clientId}`} />}
                        />
                        <Route path="/jobs" element={<ManagedJobs />} />
                        <Route path="/jobs/new" element={<NewJobRoute />} />
                        <Route path="/jobs/:clientId/:jobId" element={<EditJobRoute fallback={() => '/jobs'} />} />
                        <Route path="/repositories" element={<RepositoriesRoute />} />
                        <Route path="/repository/:repoId" element={<RepositoryDetailRoute />} />
                        <Route path="/repository/:repoId/edit" element={<RepositoryEditRoute />} />
                        <Route path="/history" element={<HistoryOverview />} />
                        <Route path="/users" element={<UserOverview />} />
                        <Route path="/tokens" element={<TokenOverview />} />
                        <Route path="/webhooks" element={<WebhookOverview />} />
                        <Route path="/webhooks/new" element={<WebhookEditorRoute />} />
                        <Route path="/webhooks/:webhookId" element={<WebhookEditorRoute />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
            </Dashboard>
        </StatusDotProvider>
    );
}

function App() {
    return (
        <ThemeProvider>
            {/* Outside the session: the cache outlives a login, and AuthProvider empties
                it on logout. */}
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <WebSocketProvider>
                        {/* Every page asks through useConfirm() and reports through useToast();
                            the one dialog and the one toast stack that answer live here. */}
                        <ToastProvider>
                            <ConfirmProvider>
                                <AppRoutes />
                            </ConfirmProvider>
                        </ToastProvider>
                    </WebSocketProvider>
                </AuthProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

function AppRoutes() {
    const { isAuthenticated } = useAuth();
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <AppLayout />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
