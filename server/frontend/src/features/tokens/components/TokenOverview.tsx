import { useState, useEffect } from 'react';
import { Token } from '@pbcm/shared';
import { TokenList } from './TokenList';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../../lib/apiFetch';

export const TokenOverview = () => {
    const { token } = useAuth();
    const [tokens, setTokens] = useState<Token[]>([]);

    // Declared before the effect that uses it: the other way round the effect read
    // `loadTokens` before its initialiser had run on that render. It returns the
    // list rather than storing it, so the effect can discard a response that only
    // arrived after `token` changed.
    const loadTokens = async (): Promise<Token[] | null> => {
        try {
            const res = await apiFetch('/api/v1/tokens');
            return res.ok ? await res.json() : null;
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const list = await loadTokens();
            if (!cancelled && list) setTokens(list);
        })();
        return () => { cancelled = true; };
    }, [token]);

    const refreshTokens = async () => {
        const list = await loadTokens();
        if (list) setTokens(list);
    };

    const deleteToken = async (tokenStr: string) => {
        try {
            const res = await apiFetch(`/api/v1/tokens/${tokenStr}`, {
                method: 'DELETE'});
            if (res.ok) refreshTokens();
        } catch (e) { console.error(e); }
    };

    return (
        <div className="space-y-6">
            <TokenList
                tokens={tokens}
                deleteToken={deleteToken}
            />
        </div>
    );
};
