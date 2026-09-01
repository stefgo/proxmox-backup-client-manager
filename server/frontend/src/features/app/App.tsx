import { ReactNode, Suspense, lazy, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  Monitor,
  HardDrive,
  Key,
  Users,
  Settings as SettingsIcon,
  Server as ServerIcon,
  Activity,
} from "lucide-react";

// Library Components
import { Dashboard, DashboardNavGroup, DashboardPage, Card } from "@stefgo/react-ui-components";

import Login from '../../pages/Login';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';

// Hooks & Stores
import { useClientStore } from "../../stores/useClientStore";
import { useRepositoryStore } from "../../stores/useRepositoryStore";
import { useGlobalJobsStore } from "../../stores/useGlobalJobsStore";
import { useUIStore } from "../../stores/useUIStore";

// Page components – loaded on demand, so a chunk only arrives when its route does.
const TokenOverview = lazy(() => import("../tokens/components/TokenOverview").then(m => ({ default: m.TokenOverview })));
const ManagedClients = lazy(() => import("../clients/components/ManagedClients").then(m => ({ default: m.ManagedClients })));
const ManagedRepositories = lazy(() => import("../repositories/components/ManagedRepositories").then(m => ({ default: m.ManagedRepositories })));
const ManagedJobs = lazy(() => import("../jobs/components/ManagedJobs").then(m => ({ default: m.ManagedJobs })));
const HistoryOverview = lazy(() => import("../history/components/HistoryOverview").then(m => ({ default: m.HistoryOverview })));
const ClientOverview = lazy(() => import("../clients/components/ClientOverview").then(m => ({ default: m.ClientOverview })));
const RepositoryOverview = lazy(() => import("../repositories/components/RepositoryOverview").then(m => ({ default: m.RepositoryOverview })));
const UserOverview = lazy(() => import("../users/components/UserOverview").then(m => ({ default: m.UserOverview })));
const Settings = lazy(() => import("../../pages/Settings"));

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { token } = useAuth();
  if (!token) {
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
  const { token } = useAuth();
  const { clients, fetchClients, deleteClient, updateClient } = useClientStore();

  return (
    <ManagedClients
      clients={clients}
      onSelect={(c) => (c ? navigate(`/client/${c.id}`) : navigate("/"))}
      onRefresh={() => {
        if (token) fetchClients();
      }}
      onDelete={(id) => {
        if (token) deleteClient(id);
      }}
      onUpdate={(id, data) => (token ? updateClient(id, data) : Promise.reject())}
    />
  );
}

function ClientDetailRoute() {
  const { clientId } = useParams();
  const { clients } = useClientStore();

  const client = clients.find((c) => c.id === clientId);
  if (!client) return <Navigate to="/clients" replace />;

  return <ClientOverview client={client} />;
}

function RepositoriesRoute() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { repositories, addRepository, updateRepository, deleteRepository } = useRepositoryStore();

  return (
    <ManagedRepositories
      repositories={repositories}
      onSelect={(r) => (r ? navigate(`/repository/${r.id}`) : navigate("/"))}
      onAdd={(r) => (token ? addRepository(r) : Promise.reject())}
      onUpdate={(id, r) => (token ? updateRepository(id, r) : Promise.reject())}
      onDelete={(id) => (token ? deleteRepository(id) : Promise.reject())}
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

function NotFound() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <Card title="Page not found">
      <div className="p-6 space-y-4">
        <p className="text-text-secondary">
          There is nothing at <code className="font-mono text-sm">{pathname}</code>.
        </p>
        <button
          type="button"
          onClick={() => navigate("/clients")}
          className="text-primary hover:text-primary-hover font-medium"
        >
          Back to clients
        </button>
      </div>
    </Card>
  );
}

function AppLayout() {
  const { token, logout } = useAuth();
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
    if (token) {
      fetchClients();
      refreshRepos();
      fetchAllJobs();
    }
  }, [token, fetchClients, refreshRepos, fetchAllJobs]);

  // Stats
  const stats = useMemo(
    () => ({
      clients: {
        active: clients.filter((c) => c.status === "online").length,
        total: clients.length,
      },
      repositories: {
        active: repos.filter((r) => r.status === "online").length,
        total: repos.length,
      },
      jobs: {
        active: globalJobs.filter((j) => {
          const client = clients.find((c) => c.id === j.clientId);
          return client?.status === "online";
        }).length,
        total: globalJobs.length,
      },
    }),
    [clients, repos, globalJobs],
  );

  let username = "User";
  try {
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1]));
      username = payload.username || payload.email || "User";
    }
  } catch (e) {
    console.error("Failed to parse token", e);
  }

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
    { id: "resources", title: "Ressources" },
    { id: "administration", title: "Administration" },
  ];

  // Navigation only – the routes below decide what is rendered.
  const pages: DashboardPage[] = useMemo(() => [
    {
      id: "clients",
      path: ["/", "/clients", "/client/:clientId"],
      nav: {
        groupId: "resources",
        label: "Clients",
        icon: Monitor,
        badge: `${stats.clients.active} / ${stats.clients.total}`,
        onClick: () => navigate("/clients"),
      },
    },
    {
      id: "jobs",
      path: "/jobs",
      nav: {
        groupId: "resources",
        label: "Jobs",
        icon: HardDrive,
        badge: `${stats.jobs.active} / ${stats.jobs.total}`,
        onClick: () => navigate("/jobs"),
      },
    },
    {
      id: "repositories",
      path: ["/repositories", "/repository/:repoId"],
      nav: {
        groupId: "resources",
        label: "Repositories",
        icon: ServerIcon,
        badge: `${stats.repositories.active} / ${stats.repositories.total}`,
        onClick: () => navigate("/repositories"),
      },
    },
    {
      id: "history",
      path: "/history",
      nav: {
        groupId: "resources",
        label: "History",
        icon: Activity,
        onClick: () => navigate("/history"),
      },
    },
    {
      id: "users",
      path: "/users",
      nav: {
        groupId: "administration",
        placement: "mobile-more",
        label: "Users",
        icon: Users,
        onClick: () => navigate("/users"),
      },
    },
    {
      id: "tokens",
      path: "/tokens",
      nav: {
        groupId: "administration",
        placement: "mobile-more",
        label: "Client Tokens",
        icon: Key,
        onClick: () => navigate("/tokens"),
      },
    },
    {
      id: "settings",
      path: "/settings",
      nav: {
        groupId: "administration",
        placement: "mobile-more",
        label: "Settings",
        icon: SettingsIcon,
        onClick: () => navigate("/settings"),
      },
    },
  ], [stats, navigate]);

  return (
    <Dashboard
      logo={logo}
      title={title}
      username={username}
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
          <Route path="/client/:clientId" element={<ClientDetailRoute />} />
          <Route path="/jobs" element={<ManagedJobs />} />
          <Route path="/repositories" element={<RepositoriesRoute />} />
          <Route path="/repository/:repoId" element={<RepositoryDetailRoute />} />
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
  const { token } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" /> : <Login />} />
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
