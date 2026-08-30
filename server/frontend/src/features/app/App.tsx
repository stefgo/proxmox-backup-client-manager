import { ReactNode, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useMatch } from 'react-router-dom';
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
import { Dashboard, DashboardNavGroup, DashboardPage } from "@stefgo/react-ui-components";

import Login from '../../pages/Login';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';

// Hooks & Stores
import { useClientStore } from "../../stores/useClientStore";
import { useRepositoryStore } from "../../stores/useRepositoryStore";
import { useGlobalJobsStore } from "../../stores/useGlobalJobsStore";
import { useUIStore } from "../../stores/useUIStore";

// Components
import { TokenOverview } from "../tokens/components/TokenOverview";
import { ManagedClients } from "../clients/components/ManagedClients";
import { ManagedRepositories } from "../repositories/components/ManagedRepositories";
import { ManagedJobs } from "../jobs/components/ManagedJobs";
import { HistoryOverview } from "../history/components/HistoryOverview";
import { ClientOverview } from "../clients/components/ClientOverview";
import { RepositoryOverview } from "../repositories/components/RepositoryOverview";
import { UserOverview } from "../users/components/UserOverview";
import Settings from "../../pages/Settings";

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

function AppLayout() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const matchClient = useMatch("/client/:clientId");
  const matchRepo = useMatch("/repository/:repoId");

  const { theme, toggleTheme } = useTheme();
  const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

  // Routing Helpers
  const path = location.pathname;

  // Client Store
  const { clients, fetchClients, deleteClient, updateClient } =
    useClientStore();
  const selectedClientId = matchClient?.params.clientId;
  const selectedClient = selectedClientId
    ? clients.find((c) => c.id === selectedClientId) || null
    : null;

  // Repository Store
  const {
    repositories: repos,
    fetchRepositories: refreshRepos,
    addRepository,
    updateRepository,
    deleteRepository,
  } = useRepositoryStore();
  const selectedRepoId = matchRepo?.params.repoId;
  const selectedRepo = selectedRepoId
    ? repos.find((r) => String(r.id) === selectedRepoId) || null
    : null;

  // Initial Fetch
  const { globalJobs, fetchAllJobs } = useGlobalJobsStore();

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

  // Dashboard Props
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
      <h1 className="text-xl font-bold text-text-primary dark:text-text-primary-dark leading-tight">P<span className="text-primary">BC</span>M</h1>
      <span className="pt-1 text-[10px] font-mono text-text-muted dark:text-text-muted-dark -mt-1 leading-none">
        {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
      </span>
    </div>
  );

  const navGroups: DashboardNavGroup[] = [
    { id: "resources", title: "Ressources" },
    { id: "administration", title: "Administration" },
  ];

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
      content: (
        <>
          {path.startsWith("/client/") && selectedClient ? (
            <ClientOverview client={selectedClient} />
          ) : (
            <ManagedClients
              clients={clients}
              onSelect={(c) => c ? navigate(`/client/${c.id}`) : navigate("/")}
              onRefresh={() => {
                if (token) fetchClients();
              }}
              onDelete={(id) => {
                if (token) deleteClient(id);
              }}
              onUpdate={(id, data) =>
                token ? updateClient(id, data) : Promise.reject()
              }
            />
          )}
        </>
      )
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
      content: (
        <ManagedJobs />
      )
    },
    {
      id: "repositories",
      path: ["/repositories", "/repository/:repositoryId"],
      nav: {
        groupId: "resources",
        label: "Repositories",
        icon: ServerIcon,
        badge: `${stats.repositories.active} / ${stats.repositories.total}`,
        onClick: () => navigate("/repositories"),
      },
      content: (
        <>
          {path.startsWith("/repository/") && selectedRepo ? (
            <RepositoryOverview repo={selectedRepo} />
          ) : (
            <ManagedRepositories
              repositories={repos}
              onSelect={(r) => r ? navigate(`/repository/${r.id}`) : navigate("/")}
              onAdd={(r) => token ? addRepository(r) : Promise.reject()}
              onUpdate={(id, r) => token ? updateRepository(id, r) : Promise.reject()}
              onDelete={(id) => token ? deleteRepository(id) : Promise.reject()}
            />
          )}
        </>
      )
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
      content: (
        <HistoryOverview />
      )
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
      content: (
        <UserOverview />
      )
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
      content: (
        <TokenOverview />
      )
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
      content: (
        <Settings />
      )
    }
  ], [
    path,
    selectedClient,
    selectedRepo,
    clients,
    repos,
    stats,
    token,
    navigate,
    fetchClients,
    deleteClient,
    updateClient,
    addRepository,
    updateRepository,
    deleteRepository
  ]);

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
    />
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
