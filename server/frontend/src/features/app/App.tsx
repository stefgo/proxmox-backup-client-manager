import { ReactNode, Suspense, lazy, useMemo, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    Monitor,
    HardDrive,
    Key,
    Users,
    Settings as SettingsIcon,
    Server as ServerIcon,
    Activity,
} from 'lucide-react';

// Library Components
import { Dashboard, DashboardNavGroup, DashboardPage, Card, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { CLIENT_STATUS, REPOSITORY_STATUS, ManagedRepository as Repository } from '@pbcm/shared';

import Login from '../../pages/Login';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { ThemeProvider } from './context/ThemeProvider';
import { useTheme } from './context/ThemeContext';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/AuthContext';
import { WebSocketProvider } from './context/WebSocketProvider';

// Hooks & Stores
import { useClientStore } from '../../stores/useClientStore';
import { useRepositoryStore } from '../../stores/useRepositoryStore';
import { useGlobalJobsStore } from '../../stores/useGlobalJobsStore';
import { useUIStore } from '../../stores/useUIStore';

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
    const { isAuthenticated } = useAuth();
    const { clients, fetchClients, deleteClient } = useClientStore();

    // Every editor route knows where back is because the surface that opened it says so.
    const open = (to: string) => navigate(to, { state: { from: pathname } });

    return (
        <ManagedClients
            clients={clients}
            onSelect={(c) => (c ? navigate(`/client/${c.id}`) : navigate('/'))}
            onRefresh={() => {
                if (isAuthenticated) fetchClients();
            }}
            onDelete={(id) =>
                isAuthenticated ? deleteClient(id) : Promise.resolve()
            }
            onAdd={() => open('/clients/new')}
            onEdit={(c) => open(`/client/${c.id}/edit`)}
            onEditTunnel={(c) => open(`/client/${c.id}/tunnel`)}
        />
    );
}

function AddClientRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const { fetchClients } = useClientStore();
    const back = (location.state as { from?: string } | null)?.from ?? '/clients';

    return (
        <AddClientWizard onClose={() => navigate(back)} onCreated={fetchClients} />
    );
}

/**
 * The three client routes below all resolve the client from the store and bail out to the
 * list if it is gone — a stale bookmark or a deleted client must not render an editor over
 * `undefined`.
 */
function useRouteClient() {
    const { clientId } = useParams();
    return useClientStore((s) => s.clients.find((c) => c.id === clientId));
}

function ClientDetailRoute() {
    const client = useRouteClient();
    if (!client) return <Navigate to="/clients" replace />;

    return <ClientOverview client={client} />;
}

function ClientEditRoute() {
    const client = useRouteClient();
    const { updateClient } = useClientStore();
    if (!client) return <Navigate to="/clients" replace />;

    return <ClientEditor client={client} onSave={updateClient} />;
}

function ClientTunnelRoute() {
    const client = useRouteClient();
    if (!client) return <Navigate to="/clients" replace />;

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
    const client = useRouteClient();
    if (!client) return <Navigate to="/clients" replace />;

    return <JobEditorPage lockedClientId={client.id} fallbackBack={`/client/${client.id}`} />;
}

function NewJobRoute() {
    return <JobEditorPage fallbackBack="/jobs" />;
}

/**
 * Resolves the job to edit from the global store, which holds every client's jobs.
 *
 * It fetches once itself rather than trusting AppLayout's initial load: a directly opened
 * URL can arrive before that returns, and "the list is empty" alone cannot tell a pending
 * fetch from a deleted job. Only once this fetch has settled is a missing job really gone.
 */
function EditJobRoute({ fallback }: { fallback: (clientId: string) => string }) {
    const { clientId, jobId } = useParams();
    const globalJobs = useGlobalJobsStore((s) => s.globalJobs);
    const fetchAllJobs = useGlobalJobsStore((s) => s.fetchAllJobs);
    const [resolved, setResolved] = useState(false);

    useEffect(() => {
        let active = true;
        fetchAllJobs().finally(() => {
            if (active) setResolved(true);
        });
        return () => {
            active = false;
        };
    }, [fetchAllJobs]);

    const job = globalJobs.find((j) => j.clientId === clientId && j.id === jobId);
    if (!job) {
        return resolved ? <Navigate to="/jobs" replace /> : <LoadingIndicator />;
    }

    return <JobEditorPage lockedClientId={job.clientId} job={job} fallbackBack={fallback(job.clientId)} />;
}

function RepositoriesRoute() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const { repositories, addRepository, updateRepository, deleteRepository } = useRepositoryStore();

    return (
        <ManagedRepositories
            repositories={repositories}
            onSelect={(r) => (r ? navigate(`/repository/${r.id}`) : navigate('/'))}
            onAdd={(r) => (isAuthenticated ? addRepository(r) : Promise.reject())}
            onUpdate={(id, r) => (isAuthenticated ? updateRepository(id, r) : Promise.reject())}
            onDelete={(id) => (isAuthenticated ? deleteRepository(id) : Promise.reject())}
        />
    );
}

function RepositoryDetailRoute() {
    const { repoId } = useParams();
    const { repositories } = useRepositoryStore();

    const repo = repositories.find((r) => String(r.id) === repoId);
    if (!repo) return <Navigate to="/repositories" replace />;

    return <RepositoryOverview repo={repo} />;
}

/**
 * Editing from the detail page needs a URL of its own: the list keeps its editor in local
 * state, which nothing outside `ManagedRepositories` can reach. `from` carries the page the
 * menu was opened on, so Cancel returns there instead of always falling back to the list.
 */
function RepositoryEditRoute() {
    const { repoId } = useParams();
    const navigate = useNavigate();
    const { state } = useLocation();
    const { repositories, updateRepository } = useRepositoryStore();

    const repo = repositories.find((r) => String(r.id) === repoId);
    const back = (state as { from?: string } | null)?.from ?? `/repository/${repoId}`;

    if (!repo) return <Navigate to="/repositories" replace />;

    return (
        <RepositoryEditor
            repository={repo}
            // Errors are not caught here: like the client editor, the form stays open and
            // reports in its own footer. Saving does not navigate away either -- the page
            // says "Repository saved" and the operator decides when to leave.
            onSave={(data: Partial<Repository>) => updateRepository(repo.id, data)}
            onCancel={() => navigate(back)}
        />
    );
}

function NotFound() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    return (
        <Card title="Page not found" padding="md" classNames={{ content: 'space-y-4' }}>
            <p className="text-text-secondary">
                There is nothing at <code className="font-mono text-sm">{pathname}</code>.
            </p>
            <button
                type="button"
                onClick={() => navigate('/clients')}
                className={cn('text-primary hover:text-primary-hover font-medium rounded-sm', FOCUS_RING)}
            >
                Back to clients
            </button>
        </Card>
    );
}

function AppLayout() {
    const { isAuthenticated, username, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const { theme, toggleTheme } = useTheme();
    const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

    const path = location.pathname;

    const { clients, fetchClients } = useClientStore();
    const { repositories: repos, fetchRepositories: refreshRepos } = useRepositoryStore();
    const { globalJobs, fetchAllJobs } = useGlobalJobsStore();

    // Initial Fetch
    useEffect(() => {
        if (isAuthenticated) {
            fetchClients();
            refreshRepos();
            fetchAllJobs();
        }
    }, [isAuthenticated, fetchClients, refreshRepos, fetchAllJobs]);

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
        { id: 'resources', title: 'Ressources' },
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
    ], [stats, navigate]);

    return (
        <Dashboard
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
            <Suspense fallback={<div className="p-6 text-text-muted">Loading…</div>}>
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
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Suspense>
        </Dashboard>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <WebSocketProvider>
                    <AppRoutes />
                </WebSocketProvider>
            </AuthProvider>
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
