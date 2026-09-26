import { createContext, useContext } from 'react';

export interface WebSocketContextType {
    isConnected: boolean;
    /**
     * The socket has been down for longer than a reconnect takes. What the page shows is
     * no longer kept current -- the frontend does not poll -- and it has to say so.
     */
    isLost: boolean;
    /**
     * Goes up by one each time the socket comes back after a drop. Anything the server
     * pushed in the meantime is gone, so an effect that loads data lists this among its
     * dependencies and loads again. It stays 0 through the first connection, which the
     * initial loads already cover.
     */
    resyncKey: number;
}

// JSX-free by design -- see AuthContext.ts. The provider lives in WebSocketProvider.tsx.
export const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
    return useContext(WebSocketContext);
};

/** `resyncKey` outside the provider is 0: nothing there reconnects. */
export const useResyncKey = () => useContext(WebSocketContext)?.resyncKey ?? 0;
