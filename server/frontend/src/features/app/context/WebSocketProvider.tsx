import { useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClientStore } from '../../../stores/useClientStore';
import { useGlobalJobsStore } from '../../../stores/useGlobalJobsStore';
import { useSchedulerStore } from '../../../stores/useSchedulerStore';
import { useHistorySeenStore } from '../../../stores/useHistorySeenStore';
import { WebSocketContext } from './WebSocketContext';
import { emit } from '../../../lib/realtimeEvents';

/**
 * How long the socket may be down before the page says so. A reconnect is scheduled 3 s
 * after a drop; a server restart is over within a few more. Anything shorter would flash
 * the banner at every deploy.
 */
const LOST_AFTER_MS = 5000;

interface WebSocketProviderProps {
    children: ReactNode;
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
    const { isAuthenticated, username } = useAuth();
    const { setClients } = useClientStore();
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
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'CLIENTS_UPDATE') {
                        setClients(data.payload);
                    }

                    // The server caches an agent's jobs only while it is connected, so
                    // this is what tells an already-open dashboard that a client came
                    // online (or dropped) and its job list changed with it.
                    if (data.type === 'JOBS_UPDATE') {
                        useGlobalJobsStore
                            .getState()
                            .setClientJobs(data.payload.clientId, data.payload.jobs);
                    }

                    // Tunnel state is runtime-only on the server; merge it into the client it belongs to.
                    if (data.type === 'TUNNEL_UPDATE') {
                        useClientStore.getState().setTunnelState(data.payload);
                    }

                    // Streamed rather than stored: these arrive many times a second for
                    // one visible component, and a store would re-render every
                    // subscriber per chunk. See lib/realtimeEvents.ts.
                    if (data.type === 'JOB_UPDATE') {
                        emit('jobUpdate', data.payload);
                    }

                    if (data.type === 'LOG_UPDATE') {
                        emit('logUpdate', data.payload);
                    }

                    if (data.type === 'JOB_NEXT_RUN_UPDATE') {
                        emit('jobNextRunUpdate', data.payload);
                    }

                    // Every dashboard receives every user's; only this user's own concerns this tab.
                    if (data.type === 'HISTORY_SEEN') {
                        if (data.payload?.username === usernameRef.current) {
                            useHistorySeenStore.getState().applySeen(data.payload);
                        }
                    }

                    // One scheduler at a time, whenever a run starts or ends or its timer moves.
                    if (data.type === 'SCHEDULER_STATUS_UPDATE') {
                        if (typeof data.payload?.scheduler === 'string' && data.payload.status) {
                            useSchedulerStore.getState().applyUpdate(data.payload);
                        }
                    }

                } catch (e) {
                    console.error('Failed to parse WS message', e);
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
    }, [isAuthenticated, setClients]);

    return (
        <WebSocketContext.Provider value={{ isConnected, isLost, resyncKey }}>
            {children}
        </WebSocketContext.Provider>
    );
};
