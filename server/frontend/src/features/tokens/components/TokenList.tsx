import { Key, Trash2 } from 'lucide-react';
import { Token } from '@pbcm/shared';
import { formatDate } from '../../../utils';
import { DataTable, DataTableDef } from '@stefgo/react-ui-components';
import { DataAction } from '@stefgo/react-ui-components';
import { Card } from '@stefgo/react-ui-components';
import { Badge } from '@stefgo/react-ui-components';

interface TokenListProps {
    tokens: Token[];
    /** Takes the token's hash: the server keeps nothing else to name it by. */
    deleteToken: (tokenHash: string) => void;
}

export const TokenList = ({ tokens, deleteToken }: TokenListProps) => {
    const columns: DataTableDef<Token>[] = [
        {
            // The token's SHA-256 hash, shortened like a commit hash; the full value is in
            // the tooltip. The token itself was shown once, when it was issued.
            tableHeader: "Token Hash",
            tableItemRender: (t) => (
                <span
                    title={t.tokenHash}
                    className={`font-mono text-sm text-text-primary ${(t.usedAt || new Date(t.expiresAt) < new Date()) ? 'line-through opacity-60' : ''}`}
                >
                    {t.tokenHash.slice(0, 12)}
                </span>
            ),
        },
        {
            // A token now carries decisions — the name the client will get and
            // the network it may register from. Hiding them would leave two
            // tokens looking identical while behaving differently.
            tableHeader: "Client",
            tableCellClassName: "text-sm",
            tableItemRender: (t) => (
                (t.displayName || t.allowedIp) ? (
                    <div>
                        {t.displayName && <div className="text-text-primary">{t.displayName}</div>}
                        {t.allowedIp && <div className="font-mono text-xs text-text-muted">{t.allowedIp}</div>}
                    </div>
                ) : <span className="text-text-muted">—</span>
            ),
        },
        {
            tableHeader: "Expires / Used",
            tableCellClassName: "text-sm text-text-muted",
            sortable: true,
            sortValue: (t) => t.usedAt ?? t.expiresAt,
            tableItemRender: (t) => {
                if (t.usedAt) return <>Used: {formatDate(t.usedAt)}</>;
                if (new Date(t.expiresAt) < new Date()) return <>Expired: {formatDate(t.expiresAt)}</>;
                return <>Expires: {formatDate(t.expiresAt)}</>;
            }
        },
        {
            tableHeader: "Status",
            sortable: true,
            sortValue: (t) => t.usedAt ? 2 : new Date(t.expiresAt) < new Date() ? 1 : 0,
            tableItemRender: (t) => {
                if (t.usedAt) return <Badge variant="neutral" size="sm">Used</Badge>;
                if (new Date(t.expiresAt) < new Date()) return <Badge variant="error" size="sm">Expired</Badge>;
                return <Badge variant="success" size="sm">Active</Badge>;
            }
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-right",
            tableCellClassName: "text-right text-sm font-medium",
            tableItemRender: (t) => (
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
            )
        }
    ];

    return (
        <Card
            title={<><Key size={18} className="text-text-muted" /> Client Tokens</>}
            padding="none"
        >
            <DataTable
                data={tokens}
                itemDef={columns}
                // colIndex 2 is "Expires / Used"; the Client column sits before it.
                sort={{ defaultValue: [{ colIndex: 2, direction: 'asc' }] }}
                keyField="tokenHash"
                emptyMessage="No tokens generated"
                className="rounded-b-xl border-0 shadow-none"
                pagination={{
                    // The view owns the page state and does the slicing; it sorts across
                    // the whole set first, so a column sort is never limited to the rows
                    // that happen to be on screen.
                    defaultValue: { pageSize: 10 },
                    hideOnSinglePage: true,
                }}
            />
        </Card>
    );
};
