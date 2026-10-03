import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Token } from '@pbcm/shared';
import { TokenList } from './TokenList';
import { api } from '../../../lib/api';
import { tokenListOptions, useTokens } from '../../../queries/tokens';
import { useToast } from '@stefgo/react-ui-components';
import { getErrorMessage } from '../../../utils';

const NO_TOKENS: Token[] = [];

export const TokenOverview = () => {
    const { show } = useToast();
    const queryClient = useQueryClient();
    // `isPending` only for the first load: a refresh keeps the rows showing.
    const { data: tokens = NO_TOKENS, isPending, error } = useTokens();

    useEffect(() => {
        if (!error) return;
        console.error(error);
        show({ variant: 'error', title: 'Could not load the tokens', description: getErrorMessage(error) });
    }, [error, show]);

    // A refused delete says so: a token the server no longer knows answers 404, and the row
    // used to stay where it was without a word.
    const deleteToken = async (tokenHash: string) => {
        try {
            await api.delete(`/api/v1/tokens/${tokenHash}`, { fallback: 'The server refused the request.' });
        } catch (e) {
            console.error(e);
            show({ variant: 'error', title: 'Could not delete the token', description: getErrorMessage(e) });
        }
        queryClient.invalidateQueries({ queryKey: tokenListOptions.queryKey });
    };

    return (
        <div className="space-y-6">
            <TokenList
                tokens={tokens}
                isLoading={isPending}
                deleteToken={deleteToken}
            />
        </div>
    );
};
