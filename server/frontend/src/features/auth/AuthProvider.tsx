import { ReactNode, useState, useEffect, useCallback } from 'react';
import { SessionUserSchema } from '@pbcm/shared';
import { setUnauthorizedHandler, hasSessionFlag, clearSessionFlag } from '../../lib/apiFetch';
import { api, publicApi } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { AuthContext } from './AuthContext';

interface AuthProviderProps {
    children: ReactNode;
}

/** setTimeout stores its delay as a signed 32-bit integer; longer delays fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Holds whether someone is logged in — never the credential itself.
 *
 * The JWT sits in an httpOnly cookie the browser attaches on its own, including on the
 * dashboard WebSocket handshake. What is left here is a flag, read from a second cookie
 * that deliberately carries no secret.
 *
 * That flag can go stale: the token may be rejected while the flag is still set. It
 * corrects itself on the first API call, because apiFetch turns a 401 into logout()
 * centrally — the arrangement that was already documented there.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(hasSessionFlag);
    const [username, setUsername] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);

    const login = useCallback(() => {
        setIsAuthenticated(true);
    }, []);

    const logout = useCallback(() => {
        setIsAuthenticated(false);
        setUsername(null);
        setExpiresAt(null);
        // Dropped here as well as by the server: if the logout request below does not get
        // through, a reload would otherwise find the flag and render the dashboard again.
        clearSessionFlag();
        // What the cache holds was read with this session. The next one may be another
        // user's, and must not start out with the previous one's lists on screen.
        queryClient.clear();
        // The session cookie is httpOnly, so only the server can remove it. Fired and
        // not awaited: the UI must return to the login form either way, and a failed
        // call would otherwise leave the user staring at a page they cannot use.
        void publicApi.post('/api/auth/logout').catch(() => undefined);
    }, []);

    // apiFetch is a plain module and cannot read this context, so it gets handed the
    // one thing it needs: what to do when the server says the session is over.
    // Clearing the flag re-renders the router into the login route.
    useEffect(() => {
        setUnauthorizedHandler(logout);
        return () => setUnauthorizedHandler(null);
    }, [logout]);

    // Asks the server who we are. Also the point where a stale session flag is caught:
    // a cookie left over from an expired token answers 401 here, which apiFetch turns
    // into the logout above — so the app lands on the login form instead of rendering a
    // dashboard whose every request is about to fail.
    useEffect(() => {
        if (!isAuthenticated) return;

        let cancelled = false;
        api.get('/api/v1/me', SessionUserSchema)
            .then((user) => {
                if (cancelled) return;
                setUsername(user.username);
                setExpiresAt(user.expiresAt ? Date.parse(user.expiresAt) : null);
            })
            .catch(() => {
                // A 401 already triggered the logout through apiFetch; anything else
                // just leaves the header without a name, which is not worth a dialog.
            });

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);

    // A 401 only arrives with the next request. An open dashboard fed by the WebSocket may
    // not send one for a long time, so the expiry is also acted on when it comes.
    useEffect(() => {
        if (expiresAt === null) return;
        const delay = expiresAt - Date.now();
        if (delay > MAX_TIMER_MS) return;
        const timer = setTimeout(logout, Math.max(delay, 0));
        return () => clearTimeout(timer);
    }, [expiresAt, logout]);

    return (
        <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
