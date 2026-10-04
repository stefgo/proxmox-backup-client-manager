import { useState, useEffect } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { getErrorMessage } from '../utils';
import { LoginPage, useTheme } from '@stefgo/react-ui-components';
import { AuthConfigSchema, type AuthConfig } from '@pbcm/shared';
import { publicApi } from '../lib/api';

/**
 * The one page that uses `publicApi` instead of `api`, and deliberately so: both
 * endpoints here are unauthenticated, and `api` turns a 401 into a logout plus redirect.
 * Routed through it, a wrong password would bounce the user out of the login form
 * instead of showing "Login failed". See the note in `lib/api.ts`.
 */
export default function Login() {
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [authType, setAuthType] = useState<AuthConfig['type'] | null>(null);
    const { login } = useAuth();
    const { theme, toggleTheme } = useTheme();

    // The OIDC return used to land here as /login?token=<JWT> and was picked up from the
    // query string. It now sets the session cookie server-side and redirects to "/", so
    // there is nothing left to read out of the URL.

    useEffect(() => {
        publicApi
            .get('/api/auth/config', AuthConfigSchema)
            .then((config) => setAuthType(config.type))
            .catch(() => setAuthType('local'));
    }, []);

    const handleLogin = async (username: string, password: string) => {
        setError('');
        setIsLoading(true);
        try {
            await publicApi.post('/api/login', { username, password }, undefined, {
                fallback: 'Login failed',
            });
            // No token to pass on — the server has set the cookies on this response.
            login();
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LoginPage
            title="Proxmox"
            titleHighlight="Backup"
            subtitle="Client Manager"
            authType={authType}
            error={error}
            isLoading={isLoading}
            onLogin={handleLogin}
            onOidcLogin={() => { window.location.href = '/api/auth/login'; }}
            theme={theme}
            onToggleTheme={toggleTheme}
        />
    );
}
