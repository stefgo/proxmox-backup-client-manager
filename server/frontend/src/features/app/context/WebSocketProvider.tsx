import { useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { queryClient } from '../../../lib/queryClient';
import { applyRunToLatest, mergeTunnelState, replaceClientJobs, setJobNextRun } from '../../../lib/cacheUpdates';
import { clientListOptions, getCachedClient } from '../../../queries/clients';
import { globalJobsOptions, latestPerJobOptions } from '../../../queries/jobs';
import { useSchedulerStore } from '../../../stores/useSchedulerStore';
import { useHistorySeenStore } from '../../../stores/useHistorySeenStore';
import { useWebhookStore } from '../../../stores/useWebhookStore';
import { WebSocketContext } from './WebSocketContext';
import { emit } from '../../../lib/realtimeEvents';
import { assertNever, createDashboardMessageReader, historyUpdateFrom } from '../lib/dashboardMessages';

/**
 * How long the socket may be down before the page says so. A reconnect is scheduled 3 s
 * after a drop; a server restart is over within a few more. Anything shorter would flash
 * the banner at every deploy.
 */
const LOST_AFTER_MS = 5000;

/** Module scope, so "reported once" holds across reconnects and not per socket. */
const readMessage = createDashboardMessageReader();

interface WebSocketProviderProps {
    children: ReactNode;
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
    const { isAuthenticated, username } = useAuth();
    // Read by the socket's handler, which must not reconnect when the name arrives.
    const usernameRef = useRef(username);
    useEffect(() => {
        usernameRef.current = username;
    }, [username]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLost, setIsLost] = useState(false);
    const [resyncKey, setResyncKey] = useState(0);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isAuthenticated) return;

        let isClosing = false;
        let connectTimeout: ReturnType<typeof setTimeout> | null = null;
        // Per effect run: a login after a logout is a first connection again, not a resync.
        let hasConnected = false;
        let lostTimeout: ReturnType<typeof setTimeout> | null = null;

        const armLostTimer = () => {
            if (lostTimeout) return;
            lostTimeout = setTimeout(() => setIsLost(true), LOST_AFTER_MS);
        };
        const disarmLostTimer = () => {
            if (lostTimeout) clearTimeout(lostTimeout);
            lostTimeout = null;
        };

        const connect = () => {
            if (socketRef.current?.readyState === WebSocket.OPEN) return;

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // No token in the URL: the browser attaches the session cookie to the
            // handshake by itself. As a query parameter the JWT was written into every
            // proxy and server access log this connection passed through.
            const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;

            console.log('Connecting to WebSocket:', wsUrl);
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
                disarmLostTimer();
                setIsLost(false);
                if (hasConnected) setResyncKey((key) => key + 1);
                hasConnected = true;
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
            };

            socket.onmessage = (event) => {
                // Parsed against the contract in @pbcm/shared; what does not match is
                // dropped and reported once per type (see lib/dashboardMessages.ts).
                const message = readMessage(event.data);
                if (!message) return;

                switch (message.type) {
                    // The whole list, so it may also be what fills the entry first.
                    case 'CLIENTS_UPDATE':
                        queryClient.setQueryData(clientListOptions.queryKey, message.payload);
                        break;

                    // The server caches an agent's jobs only while it is connected, so
                    // this is what tells an already-open dashboard that a client came
                    // online (or dropped) and its job list changed with it.
                    case 'JOBS_UPDATE': {
                        const { clientId, jobs } = message.payload;
                        queryClient.setQueryData(
                            globalJobsOptions.queryKey,
                            (all) => all && replaceClientJobs(all, clientId, jobs),
                        );
                        break;
                    }

                    // Tunnel state is runtime-only on the server; merge it into the client it belongs to.
                    case 'TUNNEL_UPDATE':
                        queryClient.setQueryData(
                            clientListOptions.queryKey,
                            (clients) => clients && mergeTunnelState(clients, message.payload),
                        );
                        break;

                    // Both state and a moment: the cache takes the run as the new state of
                    // its row, and the event is for whoever reacts to it happening -- the
                    // result toasts, a page that reloads its snapshots after a backup.
                    case 'JOB_UPDATE': {
                        const { clientId } = message.payload;
                        const job = historyUpdateFrom(message.payload.job);
                        queryClient.setQueryData(
                            latestPerJobOptions.queryKey,
                            (latest) => latest && applyRunToLatest(latest, clientId, job, getCachedClient(clientId)),
                        );
                        emit('jobUpdate', { clientId, job });
                        break;
                    }

                    // Streamed rather than stored: these arrive many times a second for
                    // one visible component, and a cache entry would re-render every
                    // subscriber per chunk. See lib/realtimeEvents.ts.
                    case 'LOG_UPDATE':
                        emit('logUpdate', message.payload);
                        break;

                    case 'JOB_NEXT_RUN_UPDATE': {
                        const { clientId, jobId, nextRunAt } = message.payload;
                        queryClient.setQueryData(
                            globalJobsOptions.queryKey,
                            (all) => all && setJobNextRun(all, clientId, jobId, nextRunAt),
                        );
                        break;
                    }

                    // Every dashboard receives every user's; only this user's own concerns this tab.
                    case 'HISTORY_SEEN':
                        if (message.payload.username === usernameRef.current) {
                            useHistorySeenStore.getState().applySeen(message.payload);
                        }
                        break;

                    // No payload: the list changed, and only a page that has loaded it re-reads it.
                    case 'WEBHOOKS_UPDATE':
                        if (useWebhookStore.getState().loaded) {
                            useWebhookStore.getState().fetchWebhooks();
                        }
                        break;

                    // One scheduler at a time, whenever a run starts or ends or its timer moves.
                    case 'SCHEDULER_STATUS_UPDATE':
                        useSchedulerStore.getState().applyUpdate(message.payload);
                        break;

                    // Does not compile while a member of DashboardMessage has no case above.
                    default:
                        assertNever(message);
                }
            };

            socket.onclose = (event) => {
                if (isClosing) return; // Ignore intentional closure

                console.log('WebSocket disconnected', event.code, event.reason);
                setIsConnected(false);
                armLostTimer();
                socketRef.current = null;

                if (event.code === 4001 || event.code === 4003) {
                    console.log('Authentication failed, stopping reconnection attempts');
                    return;
                }

                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            socket.onerror = (err) => {
                if (isClosing) return; // Ignore errors during intentional closure
                console.error('WebSocket error', err);
                socket.close();
            };
        };

        // The first connection can fail too, and then there was never a drop to arm this.
        armLostTimer();

        // Delay initial connection slightly to avoid React Strict Mode noisy double-mount in dev
        connectTimeout = setTimeout(() => {
            if (!isClosing) connect();
        }, 100);

        return () => {
            isClosing = true;
            disarmLostTimer();
            setIsLost(false);
            if (connectTimeout) {
                clearTimeout(connectTimeout);
            }
            if (socketRef.current) {
                socketRef.current.onclose = null;
                socketRef.current.close();
                socketRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [isAuthenticated]);

    return (
        <WebSocketContext.Provider value={{ isConnected, isLost, resyncKey }}>
            {children}
        </WebSocketContext.Provider>
    );
};
