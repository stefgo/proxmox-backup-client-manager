import { useState, useEffect } from 'react';
import { Token } from '@pbcm/shared';
import { TokenList } from './TokenList';
import { useAuth } from '../../auth/AuthContext';
import { TokenModal } from './TokenModal';
import { apiFetch } from '../../../lib/apiFetch';

export const TokenOverview = () => {
    const { token } = useAuth();
    const [tokens, setTokens] = useState<Token[]>([]);
    const [createdToken, setCreatedToken] = useState<{ token: string; expiresAt: string } | null>(null);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

    useEffect(() => {
        fetchTokens();
    }, [token]);

    const fetchTokens = async () => {
        try {
            const res = await apiFetch('/api/v1/tokens');
            if (res.ok) setTokens(await res.json());
        } catch (e) { console.error(e); }
    };

    const deleteToken = async (tokenStr: string) => {
        try {
            const res = await apiFetch(`/api/v1/tokens/${tokenStr}`, {
                method: 'DELETE'});
            if (res.ok) fetchTokens();
        } catch (e) { console.error(e); }
    };

    const generateToken = async () => {
        try {
            const res = await apiFetch('/api/v1/tokens', {
                method: 'POST'});
            if (res.ok) {
                const newToken = await res.json();
                setCreatedToken(newToken);
                setIsTokenModalOpen(true);
                fetchTokens();
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <TokenList
                tokens={tokens}
                deleteToken={deleteToken}
                generateToken={generateToken}
            />

            {isTokenModalOpen && createdToken && (
                <TokenModal
                    token={createdToken.token}
                    expiresAt={createdToken.expiresAt}
                    onClose={() => setIsTokenModalOpen(false)}
                />
            )}
        </div>
    );
};
