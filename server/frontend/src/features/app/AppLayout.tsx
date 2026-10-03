import { Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom';
import { ConnectionBanner, Dashboard, DashboardNavGroup, DashboardPage, LoadingIndicator, StatusDotProvider } from '@stefgo/react-ui-components';

import { useTheme } from './context/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { useWebSocket } from './context/WebSocketContext';
import { navEntries, type RouteHandle } from './routes';
import { ROUTES } from '../../lib/paths';
import { APP_NAME, routeTitle, type TitleSubject } from '../../lib/pageTitle';
import { activeJobCount, clientCount, formatOnlineCount, repositoryCount } from '../dashboard/lib/dashboard';

// Hooks, queries & stores
import { useClients } from '../../queries/clients';
import { useRepositories } from '../../queries/repositories';
import { useGlobalJobs } from '../../queries/jobs';
import { useUIStore } from '../../stores/useUIStore';
import { useUnseenFailures } from '../../queries/history';
import { useJobResultToasts } from '../../hooks/useJobResultToasts';

type PageNav = NonNullable<DashboardPage['nav']>;

const NAV_GROUPS: DashboardNavGroup[] = [
    { id: 'resources', title: 'Resources' },
    { id: 'administration', title: 'Administration' },
];

/** The dashboard shell around every page behind the login. The page itself is the outlet. */
export function AppLayout() {
    const { username, logout } = useAuth();
    const connection = useWebSocket();
    const isLost = connection?.isLost ?? false;
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // The area the open route belongs to -- the innermost match that carries a sidebar
    // entry. This is what marks the entry while an editor or a detail view is open.
    const matches = useMatches();
    const activeId = matches
        .map((match) => (match.handle as RouteHandle | undefined)?.nav?.id)
        .filter(Boolean)
        .pop();

    const { theme, toggleTheme } = useTheme();
    const { isSidebarCollapsed, toggleSidebarCollapsed } = useUIStore();

    const { clients } = useClients();
    const { repositories: repos } = useRepositories();
    const { jobs: globalJobs } = useGlobalJobs();
    // Not on the history page itself: what fails there is in view as it arrives.
    const unseenFailures = useUnseenFailures() && pathname !== ROUTES.history;

    // In the shell rather than a page: a run outlives the page it was started from.
    useJobResultToasts();

    // The browser tab names the area and what is open in it. Here rather than in each
    // page: the route tree says what a page is, and the three lists that name a subject
    // are in the shell's cache anyway.
    const title = useMemo(() => {
        const { clientId, repoId, jobId } = matches[matches.length - 1]?.params ?? {};
        const nameOf = (subject: TitleSubject) => {
            switch (subject) {
                case 'client': {
                    const client = clients.find((c) => c.id === clientId);
                    return client && (client.displayName || client.hostname);
                }
                case 'repository': {
                    const repo = repos.find((r) => String(r.id) === repoId);
                    return repo && `${repo.baseUrl}:${repo.datastore}`;
                }
                case 'job':
                    return globalJobs.find((j) => j.clientId === clientId && j.id === jobId)?.name;
            }
        };
        return routeTitle(matches.map((match) => match.handle as RouteHandle | undefined), nameOf);
    }, [matches, clients, repos, globalJobs]);

    // Taken back when the shell goes: the login page behind a logout is not the page
    // that was open before it.
    useEffect(() => {
        document.title = title;
        return () => {
            document.title = APP_NAME;
        };
    }, [title]);

    // The same counts the dashboard's cards show, from the same functions.
    const stats = useMemo(
        () => ({
            clients: formatOnlineCount(clientCount(clients)),
            repositories: formatOnlineCount(repositoryCount(repos)),
            // Only the active count: the total counted the same cache, so on an
            // offline client both halves read the same number and said nothing.
            jobs: String(activeJobCount(globalJobs, clients)),
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

    const brand = (
        <div className="flex flex-col">
            <h1 className="text-xl font-bold text-text-primary leading-tight">P<span className="text-primary">BC</span>M</h1>
            <span className="pt-1 text-[10px] font-mono text-text-muted -mt-1 leading-none">
                {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
            </span>
        </div>
    );

    // Navigation only – the route tree decides what is rendered, and which entries exist.
    // What is added here is what only the running application knows.
    const pages: DashboardPage[] = useMemo(() => {
        const live: Record<string, Partial<PageNav>> = {
            clients: { badge: stats.clients },
            repositories: { badge: stats.repositories },
            jobs: { badge: stats.jobs },
            history: { badgeDot: unseenFailures, badgeTone: unseenFailures ? 'error' : undefined },
        };

        return navEntries.map(({ id, path, ...entry }) => ({
            id,
            active: id === activeId,
            nav: { ...entry, ...live[id], onClick: () => navigate(path) },
        }));
    }, [stats, navigate, unseenFailures, activeId]);

    return (
        // While the socket is lost, no status dot pulses: nothing is watching those states.
        <StatusDotProvider live={!isLost}>
            <Dashboard
                banner={<ConnectionBanner connected={!isLost} />}
                logo={logo}
                title={brand}
                username={displayName}
                onLogout={logout}
                theme={theme}
                onToggleTheme={toggleTheme}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={toggleSidebarCollapsed}
                pages={pages}
                navGroups={NAV_GROUPS}
                currentPath={pathname}
            >
                <Suspense fallback={<LoadingIndicator />}>
                    <Outlet />
                </Suspense>
            </Dashboard>
        </StatusDotProvider>
    );
}
