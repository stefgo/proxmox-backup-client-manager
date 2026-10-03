import { useCallback } from 'react';
import { Key, Trash2 } from 'lucide-react';
import { Token } from '@pbcm/shared';
import {
    Badge,
    DataAction,
    DataMultiView,
    type DataColumnDef,
} from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { PAGE_SIZE, pagination } from '../../../components/listDefaults';
import { actionsColumn, listGroups } from '../../../components/listColumns';

interface TokenListProps {
    tokens: Token[];
    isLoading: boolean;
    /** Takes the token's hash: the server keeps nothing else to name it by. */
    deleteToken: (tokenHash: string) => void;
}

const isExpired = (t: Token) => new Date(t.expiresAt) < new Date();

/**
 * The token's SHA-256 hash, shortened like a commit hash; the full value is in the tooltip.
 * The token itself was shown once, when it was issued. Struck through once it can no
 * longer register a client.
 */
const TokenHash = ({ token: t }: { token: Token }) => (
    <span
        title={t.tokenHash}
        className={`font-mono text-sm text-text-primary ${t.usedAt || isExpired(t) ? 'line-through opacity-60' : ''}`}
    >
        {t.tokenHash.slice(0, 12)}
    </span>
);

/**
 * A token carries decisions -- the name the client will get and the network it may
 * register from. Hiding them would leave two tokens looking identical while behaving
 * differently.
 */
const ClientDefaults = ({ token: t }: { token: Token }) => {
    if (!t.displayName && !t.allowedIp) return <span className="text-sm text-text-muted">—</span>;
    return (
        <div className="text-sm">
            {t.displayName && <div className="text-text-primary">{t.displayName}</div>}
            {t.allowedIp && <div className="font-mono text-xs text-text-muted">{t.allowedIp}</div>}
        </div>
    );
};

const Validity = ({ token: t }: { token: Token }) => {
    if (t.usedAt) return <>Used: {formatDate(t.usedAt)}</>;
    if (isExpired(t)) return <>Expired: {formatDate(t.expiresAt)}</>;
    return <>Expires: {formatDate(t.expiresAt)}</>;
};

const StatusBadge = ({ token: t }: { token: Token }) => {
    if (t.usedAt) return <Badge variant="neutral" size="sm">Used</Badge>;
    if (isExpired(t)) return <Badge variant="error" size="sm">Expired</Badge>;
    return <Badge variant="success" size="sm">Active</Badge>;
};

/**
 * The registration tokens, built like every other list of the app. Tokens are issued in the
 * add-client wizard, which is also where the defaults a token carries are entered -- so the
 * list has no add button.
 */
export const TokenList = ({ tokens, isLoading, deleteToken }: TokenListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam();

    // Handed to the view instead of applied in front of it: only then can the view tell an
    // empty search from an empty list, and page through what the search left.
    const matchesSearch = useCallback((t: Token, query: string) => {
        const q = query.toLowerCase();
        return t.tokenHash.includes(q) ||
            (t.displayName ?? '').toLowerCase().includes(q) ||
            (t.allowedIp ?? '').toLowerCase().includes(q);
    }, []);

    // One set of actions for both views, so the table and the list cannot drift apart.
    const renderActions = (t: Token) => (
        <div onClick={(e) => e.stopPropagation()}>
            <DataAction
                rowId={t.tokenHash}
                menuEntries={[
                    {
                        label: 'Delete Token',
                        icon: Trash2,
                        onClick: () => deleteToken(t.tokenHash),
                        variant: 'danger',
                    },
                ]}
            />
        </div>
    );

    const columns: DataColumnDef<Token>[] = [
        {
            header: 'Token Hash',
            list: { label: null },
            // The list has no column for the status, so the badge leads the row there.
            render: (t, view) =>
                view === 'list' ? (
                    <div className="flex items-center gap-2 py-1">
                        <StatusBadge token={t} />
                        <TokenHash token={t} />
                    </div>
                ) : (
                    <TokenHash token={t} />
                ),
        },
        {
            header: 'Client',
            render: (t) => <ClientDefaults token={t} />,
        },
        {
            header: 'Expires / Used',
            sortable: true,
            sortValue: (t) => t.usedAt ?? t.expiresAt,
            list: { label: 'Validity' },
            render: (t) => (
                <span className="text-sm text-text-muted">
                    <Validity token={t} />
                </span>
            ),
        },
        {
            header: 'Status',
            sortable: true,
            sortValue: (t) => (t.usedAt ? 2 : isExpired(t) ? 1 : 0),
            list: false,
            render: (t) => <StatusBadge token={t} />,
        },
        actionsColumn(renderActions),
    ];

    return (
        <DataMultiView
            title={<><Key size={18} className="text-text-muted" /> Client Tokens</>}
            // colIndex 2 is "Expires / Used"; the Client column sits before it.
            sort={{ defaultValue: [{ colIndex: 2, direction: 'asc' }] }}
            viewMode={{ persist: { key: 'tokenViewMode', scope: 'local' } }}
            data={tokens}
            columns={columns}
            listGroups={listGroups('flex-1 min-w-0')}
            keyField="tokenHash"
            isLoading={isLoading}
            loadingMessage="Loading tokens…"
            searchable
            searchPlaceholder="Search tokens…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No tokens match “${searchQuery}”.`}
            emptyMessage="No tokens generated"
            pagination={pagination(PAGE_SIZE.page)}
        />
    );
};
