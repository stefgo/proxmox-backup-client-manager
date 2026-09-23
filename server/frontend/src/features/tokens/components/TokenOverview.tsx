import { useState, useEffect } from 'react';
import { Token } from '@pbcm/shared';
import { TokenList } from './TokenList';
import { useAuth } from '../../auth/AuthContext';
import { apiFetch } from '../../../lib/apiFetch';
import { useConfirm } from '@stefgo/react-ui-components';

export const TokenOverview = () => {
    const { isAuthenticated } = useAuth();
    const { alert } = useConfirm();
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
    }, [isAuthenticated]);

    const refreshTokens = async () => {
        const list = await loadTokens();
        if (list) setTokens(list);
    };

    // A refused delete says so: a token the server no longer knows answers 404, and the row
    // used to stay where it was without a word.
    const deleteToken = async (tokenHash: string) => {
        try {
            const res = await apiFetch(`/api/v1/tokens/${tokenHash}`, {
                method: 'DELETE'});
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert({
                    title: 'Could not delete the token',
                    description: data.error || 'The server refused the request.',
                });
            }
            refreshTokens();
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
