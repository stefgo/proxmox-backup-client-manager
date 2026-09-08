import { ReactNode, useState, useEffect, useCallback } from 'react';
import { setUnauthorizedHandler, TOKEN_STORAGE_KEY } from '../../lib/apiFetch';
import { AuthContext } from './AuthContext';

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));

    // Memoised like logout below: Login.tsx keeps this in an effect's dependency
    // array, so an unstable identity re-ran that effect on every render.
    const login = useCallback((newToken: string) => {
        setToken(newToken);
        localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    }, []);

    // apiFetch is a plain module and cannot read this context, so it gets handed the
    // one thing it needs: what to do when the server says the session is over.
    // Clearing the token re-renders the router into the login route.
    useEffect(() => {
        setUnauthorizedHandler(logout);
        return () => setUnauthorizedHandler(null);
    }, [logout]);

    return (
        <AuthContext.Provider value={{ token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
