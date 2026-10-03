import { useState, useEffect, useCallback } from 'react';
import { TokenListSchema, type Token } from '@pbcm/shared';
import { TokenList } from './TokenList';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../../lib/api';
import { useToast } from '@stefgo/react-ui-components';
import { getErrorMessage } from '../../../utils';

export const TokenOverview = () => {
    const { isAuthenticated } = useAuth();
    const { show } = useToast();
    const [tokens, setTokens] = useState<Token[]>([]);
    // Only ever lowered: the first load starts with it set, a refresh keeps the rows showing.
    const [isLoading, setIsLoading] = useState(true);

    // Declared before the effect that uses it: the other way round the effect read
    // `loadTokens` before its initialiser had run on that render. It returns the
    // list rather than storing it, so the effect can discard a response that only
    // arrived after `token` changed.
    const loadTokens = useCallback(async (): Promise<Token[] | null> => {
        try {
            return await api.get('/api/v1/tokens', TokenListSchema, { fallback: 'Failed to load tokens' });
        } catch (e) {
            console.error(e);
            show({ variant: 'error', title: 'Could not load the tokens', description: getErrorMessage(e) });
            return null;
        }
    }, [show]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const list = await loadTokens();
            if (cancelled) return;
            if (list) setTokens(list);
            setIsLoading(false);
        })();
        return () => { cancelled = true; };
    }, [isAuthenticated, loadTokens]);

    const refreshTokens = async () => {
        const list = await loadTokens();
        if (list) setTokens(list);
    };

    // A refused delete says so: a token the server no longer knows answers 404, and the row
    // used to stay where it was without a word.
    const deleteToken = async (tokenHash: string) => {
        try {
            await api.delete(`/api/v1/tokens/${tokenHash}`, { fallback: 'The server refused the request.' });
        } catch (e) {
            console.error(e);
            show({ variant: 'error', title: 'Could not delete the token', description: getErrorMessage(e) });
        }
        refreshTokens();
    };

    return (
        <div className="space-y-6">
            <TokenList
                tokens={tokens}
                isLoading={isLoading}
                deleteToken={deleteToken}
            />
        </div>
    );
};
