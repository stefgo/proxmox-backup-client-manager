import { useMemo, useEffect } from "react";
import {
    useNavigate,
    useLocation,
    useMatch,
    useSearchParams,
} from "react-router-dom";

// Components
// Layout & Components
import { DashboardLayout } from "../layouts/DashboardLayout";
import { TokenOverview } from "./TokenOverview";

// Managed Components
import { ManagedClients } from "../features/clients/components/ManagedClients";
import { ManagedRepositories } from "../features/repositories/components/ManagedRepositories";
import { ManagedJobs } from "../features/jobs/components/ManagedJobs";
import { HistoryOverview } from "../features/history/components/HistoryOverview";

// Pages
import { ClientOverview } from "../features/clients/components/ClientOverview";
import { RepositoryOverview } from "../features/repositories/components/RepositoryOverview";
import { UserOverview } from "./UserOverview";
import Settings from "./Settings";

// Hooks
import { useAuth } from "../features/auth/AuthContext";
import { useClientStore } from "../stores/useClientStore";
import { useRepositoryStore } from "../stores/useRepositoryStore";
import { useGlobalJobsStore } from "../stores/useGlobalJobsStore";

export default function Dashboard() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const matchClient = useMatch("/client/:clientId");
    const matchRepo = useMatch("/repository/:repoId");

    // Routing State
    const view = useMemo(() => {
        const path = location.pathname;
        if (path.startsWith("/client/")) return "client-detail";
        if (path.startsWith("/repository/")) return "repository-detail";
        if (path === "/tokens") return "tokens";
        if (path === "/users") return "users";
        if (path === "/settings") return "settings";
        if (path === "/clients") return "clients";
        if (path === "/repositories") return "repositories";
        if (path === "/jobs") return "jobs";
        if (path === "/history") return "history";
        return "clients"; // Default view
    }, [location.pathname, searchParams]);

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
            fetchClients(token);
            refreshRepos(token);
            fetchAllJobs(token);
        }
    }, [token]);

    const handleSetView = (
        v:
            | "clients"
            | "jobs"
            | "history"
            | "repositories"
            | "tokens"
            | "users"
            | "settings"
            | "client-detail"
            | "repository-detail",
    ) => {
        if (v === "clients") navigate("/clients");
        else if (v === "repositories") navigate("/repositories");
        else if (v === "jobs") navigate("/jobs");
        else if (v === "history") navigate("/history");
        else if (v === "tokens") navigate("/tokens");
        else if (v === "users") navigate("/users");
        else if (v === "settings") navigate("/settings");
    };

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

    return (
        <DashboardLayout
            view={view}
            setView={handleSetView}
            selectedClient={selectedClient}
            stats={stats}
        >
            {view === "clients" && (
                <ManagedClients
                    clients={clients}
                    onSelect={(c) =>
                        c ? navigate(`/client/${c.id}`) : navigate("/")
                    }
                    onRefresh={() => {
                        if (token) fetchClients(token);
                    }}
                    onDelete={(id) => {
                        if (token) deleteClient(id, token);
                    }}
                    onUpdate={(id, data) =>
                        token ? updateClient(id, data, token) : Promise.reject()
                    }
                />
            )}

            {view === "repositories" && (
                <ManagedRepositories
                    repositories={repos}
                    onSelect={(r) =>
                        r ? navigate(`/repository/${r.id}`) : navigate("/")
                    }
                    onAdd={(r) =>
                        token ? addRepository(r, token) : Promise.reject()
                    }
                    onUpdate={(id, r) =>
                        token
                            ? updateRepository(id, r, token)
                            : Promise.reject()
                    }
                    onDelete={(id) =>
                        token ? deleteRepository(id, token) : Promise.reject()
                    }
                />
            )}

            {view === "jobs" && <ManagedJobs />}

            {view === "history" && <HistoryOverview />}

            {view === "tokens" && <TokenOverview />}

            {view === "users" && <UserOverview />}

            {view === "settings" && <Settings />}

            {view === "client-detail" && selectedClient && (
                <ClientOverview client={selectedClient} />
            )}

            {view === "repository-detail" && selectedRepo && (
                <RepositoryOverview repo={selectedRepo} />
            )}
        </DashboardLayout>
    );
}
