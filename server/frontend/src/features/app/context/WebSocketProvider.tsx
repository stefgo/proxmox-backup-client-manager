import { useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useClientStore } from '../../../stores/useClientStore';
import { useGlobalJobsStore } from '../../../stores/useGlobalJobsStore';
import { WebSocketContext } from './WebSocketContext';
import { emit } from '../../../lib/realtimeEvents';

interface WebSocketProviderProps {
    children: ReactNode;
}

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
    const { isAuthenticated } = useAuth();
    const { setClients } = useClientStore();
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isAuthenticated) return;

        let isClosing = false;
        let connectTimeout: ReturnType<typeof setTimeout> | null = null;

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

                } catch (e) {
                    console.error('Failed to parse WS message', e);
                }
            };

            socket.onclose = (event) => {
                if (isClosing) return; // Ignore intentional closure

                console.log('WebSocket disconnected', event.code, event.reason);
                setIsConnected(false);
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

        // Delay initial connection slightly to avoid React Strict Mode noisy double-mount in dev
        connectTimeout = setTimeout(() => {
            if (!isClosing) connect();
        }, 100);

        return () => {
            isClosing = true;
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
        <WebSocketContext.Provider value={{ isConnected }}>
            {children}
        </WebSocketContext.Provider>
    );
};
