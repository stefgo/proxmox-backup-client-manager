import { ReactNode, useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LoadingIndicator } from '@stefgo/react-ui-components';
import type { Client, ManagedRepository, RepositoryInput } from '@pbcm/shared';

import Login from '../../pages/Login';
import { NotFoundCard } from '../../components/NotFoundCard';
import { useAuth } from '../auth/AuthContext';
import { useBackPath } from '../../hooks/useBackPath';
import { NotFoundError } from '../../lib/notFound';
import { ROUTES, paths } from '../../lib/paths';
import { queryKeys } from '../../lib/queryKeys';
import { useClient, useClients, useDeleteClient, useUpdateClient } from '../../queries/clients';
import { useGlobalJobs } from '../../queries/jobs';
import {
    useAddRepository,
    useDeleteRepository,
    useRepositories,
    useRepositorySnapshots,
    useUpdateRepository,
} from '../../queries/repositories';
import { useRouteClient, useRouteRepository } from './routeContext';
import {
    AddClientWizard,
    ClientEditor,
    ClientOverview,
    ClientTunnelEditor,
    JobEditorPage,
    ManagedClients,
    ManagedRepositories,
    RepositoryEditor,
    RepositoryOverview,
    SnapshotRestoreEditor,
} from './lazyPages';


// ---------------------------------------------------------------------------
// What the route tree in `routes.tsx` renders. Each element pulls what it needs
// from the query cache itself; none of them knows a path -- those come from
// `lib/paths.ts`, and "back" from the tree through `useBackPath`.
// ---------------------------------------------------------------------------

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) {
        return <Navigate to={ROUTES.login} replace />;
    }
    return <>{children}</>;
}

export function LoginRoute() {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <Navigate to={ROUTES.root} /> : <Login />;
}

export function NotFound() {
    const { pathname } = useLocation();

    return (
        <NotFoundCard title="Page not found" backTo={ROUTES.clients} backLabel="Back to clients">
            There is nothing at <code className="font-mono text-sm">{pathname}</code>.
        </NotFoundCard>
    );
}

// --- Clients ---------------------------------------------------------------

export function ClientsRoute() {
    const navigate = useNavigate();
    const { clients, refetch } = useClients();
    const { mutateAsync: deleteClient } = useDeleteClient();

    return (
        <ManagedClients
            clients={clients}
            onSelect={(c) => navigate(c ? paths.client(c.id) : ROUTES.clients)}
            onRefresh={refetch}
            onDelete={deleteClient}
            onAdd={() => navigate(ROUTES.clientNew)}
            onEdit={(c) => navigate(paths.clientEdit(c.id))}
            onEditTunnel={(c) => navigate(paths.clientTunnel(c.id))}
        />
    );
}

export function AddClientRoute() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const back = useBackPath();

    return (
        <AddClientWizard
            onClose={() => navigate(back)}
            onCreated={() => queryClient.invalidateQueries({ queryKey: queryKeys.clients.list() })}
        />
    );
}

/**
 * The layout route at `/clients/:clientId`: resolves the client once for everything below
 * it and hands it down as the outlet context (`useRouteClient`).
 *
 * The client comes from the cached list. While that is pending this shows the spinner: a
 * reloaded or shared URL renders before the first fetch returns, and an empty list then
 * says nothing about whether the client exists. Only after that is a missing client
 * really gone -- a stale bookmark or a deleted client gets the not-found card, and the URL
 * stays where it was.
 */
export function ClientBoundary() {
    const { clientId } = useParams();
    const { isPending } = useClients();
    const client = useClient(clientId);

    if (!client) {
        if (isPending) return <LoadingIndicator label="Loading client…" />;
        throw new NotFoundError('client');
    }
    return <Outlet context={client satisfies Client} />;
}

export function ClientDetailRoute() {
    return <ClientOverview client={useRouteClient()} />;
}

export function ClientEditRoute() {
    const client = useRouteClient();
    const { mutateAsync: updateClient } = useUpdateClient();

    return <ClientEditor client={client} onSave={(clientId, data) => updateClient({ clientId, data })} />;
}

export function ClientTunnelRoute() {
    return <ClientTunnelEditor client={useRouteClient()} />;
}

// --- Jobs ------------------------------------------------------------------

/**
 * The job editor sits under two path families for the same page: under the client when it
 * was opened from there, under `/jobs` when it was opened from the list across all clients.
 * The sidebar then keeps marking the place the operator came from, both URLs stay honest
 * about what they show -- and the tree, not a prop, says where each of them closes onto.
 *
 * Creating is the only case where the client is open to choice, and only from `/jobs/new`:
 * a job is saved through `POST /api/v1/clients/:clientId/jobs`, so an existing one cannot
 * change hands, and one started from a client already has its answer.
 */
export function NewClientJobRoute() {
    return <JobEditorPage lockedClientId={useRouteClient().id} />;
}

export function NewJobRoute() {
    return <JobEditorPage />;
}

/**
 * Resolves the job to edit from the list that holds every client's jobs, for both path
 * families.
 *
 * A directly opened URL renders before that list has answered, and "the list is empty"
 * alone cannot tell a pending fetch from a deleted job. Only once it is no longer pending
 * is a missing job really gone.
 */
export function EditJobRoute() {
    const { clientId, jobId } = useParams();
    const { jobs: globalJobs, isPending } = useGlobalJobs();

    const job = globalJobs.find((j) => j.clientId === clientId && j.id === jobId);
    if (!job) {
        if (isPending) return <LoadingIndicator label="Loading job…" />;
        throw new NotFoundError('job');
    }

    return <JobEditorPage lockedClientId={job.clientId} job={job} />;
}

// --- Repositories ----------------------------------------------------------

export function RepositoriesRoute() {
    const navigate = useNavigate();
    const { repositories } = useRepositories();
    const { mutateAsync: deleteRepository } = useDeleteRepository();

    return (
        <ManagedRepositories
            repositories={repositories}
            onSelect={(r) => navigate(paths.repository(r.id))}
            onAdd={() => navigate(ROUTES.repositoryNew)}
            onEdit={(r) => navigate(paths.repositoryEdit(r.id))}
            onDelete={deleteRepository}
        />
    );
}

/** Same waiting and not-found handling as `ClientBoundary`, for `/repositories/:repoId`. */
export function RepositoryBoundary() {
    const { repoId } = useParams();
    const { repositories, isPending } = useRepositories();
    const repo = repositories.find((r) => String(r.id) === repoId);

    if (!repo) {
        if (isPending) return <LoadingIndicator label="Loading repository…" />;
        throw new NotFoundError('repository');
    }
    return <Outlet context={repo satisfies ManagedRepository} />;
}

export function RepositoryDetailRoute() {
    return <RepositoryOverview repo={useRouteRepository()} />;
}

/**
 * A new repository leaves once it is saved -- a form that has produced its repository
 * would only produce a second one. Errors are not caught here: the form stays open and
 * reports in its own footer.
 */
export function RepositoryNewRoute() {
    const navigate = useNavigate();
    const back = useBackPath();
    const { mutateAsync: addRepository } = useAddRepository();

    return (
        <RepositoryEditor
            onSave={async (data: RepositoryInput) => {
                await addRepository(data);
                navigate(back);
            }}
            onCancel={() => navigate(back)}
        />
    );
}

/**
 * The one way into the repository form for an existing repository, from the list and from
 * the detail page alike. Saving does not navigate away -- the page says "Repository saved"
 * and the operator decides when to leave, like the client editor.
 */
export function RepositoryEditRoute() {
    const repo = useRouteRepository();
    const navigate = useNavigate();
    const back = useBackPath();
    const { mutateAsync: updateRepository } = useUpdateRepository();

    return (
        <RepositoryEditor
            repository={repo}
            onSave={(data: RepositoryInput) => updateRepository({ id: repo.id, repo: data })}
            onCancel={() => navigate(back)}
        />
    );
}

// --- Restore ---------------------------------------------------------------

interface SnapshotRestoreRouteProps {
    repo: ManagedRepository;
    /** Whose snapshot: the client of the route, or the id the URL carries. */
    backupId: string | undefined;
    /** Given, the restore goes to this client; without, the form offers every client. */
    selectedClient?: Client;
}

/**
 * The restore form as a page. The snapshot is named by the URL -- type, id and time are
 * what identifies it on the PBS -- and read from the repository's snapshot list, the same
 * cache entry the page it was opened from shows.
 */
function SnapshotRestoreRoute({ repo, backupId, selectedClient }: SnapshotRestoreRouteProps) {
    const { backupType, backupTime } = useParams();
    const navigate = useNavigate();
    const back = useBackPath();
    const { clients } = useClients();
    const { data, isPending, error } = useRepositorySnapshots(repo.id);

    // Escape does what the form's own X does. Not while a select uses it for itself.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            navigate(back);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [navigate, back]);

    if (isPending) return <LoadingIndicator label="Loading snapshot…" />;
    // A list that could not be read says nothing about whether the snapshot exists.
    if (error) throw error;

    const snapshot = (data ?? []).find(
        (s) => s.backupType === backupType && s.backupId === backupId && String(s.backupTime) === backupTime,
    );
    if (!snapshot) throw new NotFoundError('snapshot', back);

    return (
        <SnapshotRestoreEditor
            snapshot={snapshot}
            repo={repo}
            selectedClient={selectedClient}
            clients={selectedClient ? undefined : clients}
            onCancel={() => navigate(back)}
        />
    );
}

/** Below a client: the repository is in the URL, the snapshot is one of the client's own. */
export function ClientRestoreRoute() {
    const client = useRouteClient();
    const { repoId } = useParams();
    const back = useBackPath();
    const { repositories, isPending } = useRepositories();
    const repo = repositories.find((r) => String(r.id) === repoId);

    if (!repo) {
        if (isPending) return <LoadingIndicator label="Loading snapshot…" />;
        throw new NotFoundError('snapshot', back);
    }
    return <SnapshotRestoreRoute repo={repo} backupId={client.id} selectedClient={client} />;
}

export function RepositoryRestoreRoute() {
    const { backupId } = useParams();
    return <SnapshotRestoreRoute repo={useRouteRepository()} backupId={backupId} />;
}
