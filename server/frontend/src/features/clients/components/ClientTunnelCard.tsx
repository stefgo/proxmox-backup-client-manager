import { useEffect, useState } from 'react';
import { TunnelState, TunnelStatus } from '@pbcm/shared';
import { Check, Copy, PlugZap, Save, ShieldAlert } from 'lucide-react';
import { Badge, Button, Card, Input } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { StatusDot, StatusTone } from './StatusDot';
import { SshKeyFields, SshKeyMode } from './SshKeyFields';
import { SshHostSetupSnippet } from './SshHostSetupSnippet';
import { apiFetch } from '../../../lib/apiFetch';
import { formatDate } from '../../../utils';

interface ClientTunnelCardProps {
    clientId: string;
    /** Live state from the client store — kept current by TUNNEL_UPDATE over the socket. */
    state?: TunnelState;
    /** Reported upwards so the editor's action bar can warn before the operator leaves. */
    onDirtyChange?: (dirty: boolean) => void;
}

/** Stored tunnel configuration. The private key is write-only and never part of this. */
interface TunnelInfo {
    sshHost: string;
    sshPort: number;
    sshUser: string;
    hostKeySha256: string;
    remoteBindHost: string;
}

interface TestResult {
    ok: boolean;
    hostKeySha256?: string;
    boundPort?: number;
    error?: string;
}

/**
 * The tunnel has four states where a client has two, but they map onto the same indicator —
 * the point of showing it the same way is that "is this connection up" is answered in one
 * place and one idiom on every client surface.
 */
const STATUS_TONE: Record<TunnelStatus, StatusTone> = {
    up: 'online',
    connecting: 'connecting',
    error: 'error',
    idle: 'offline',
};

const COPY_FEEDBACK_MS = 2000;

/**
 * SSH credentials of an outbound client, and the two actions that belong to them.
 *
 * Deliberately limited: connection mode, tunnel target and bind port are not editable —
 * the mode is fixed at creation, the target follows from each job's repository, and the
 * port is allocated per forward.
 *
 * The card owns its own save button because the credentials are their own endpoint. The
 * test button sends the *form* values, not the stored ones, so a green result always
 * describes what is on screen.
 */
export const ClientTunnelCard = ({ clientId, state, onDirtyChange }: ClientTunnelCardProps) => {
    const { token } = useAuth();
    const [info, setInfo] = useState<TunnelInfo | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [sshHost, setSshHost] = useState('');
    const [sshPort, setSshPort] = useState('22');
    const [sshUser, setSshUser] = useState('');
    const [keyMode, setKeyMode] = useState<SshKeyMode>('keep');
    const [privateKey, setPrivateKey] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    /** A fingerprint the host actually presented that differs from the stored one. */
    const [unknownHostKey, setUnknownHostKey] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiFetch(`/api/v1/clients/${clientId}/tunnel`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `Could not load the tunnel configuration (HTTP ${res.status})`);
                setInfo(data);
                setSshHost(data.sshHost);
                setSshPort(String(data.sshPort));
                setSshUser(data.sshUser);
            } catch (e) {
                setLoadError(e instanceof Error ? e.message : String(e));
            }
        };
        load();
    }, [clientId, token]);

    const isDirty =
        !!info &&
        (sshHost !== info.sshHost ||
            sshPort !== String(info.sshPort) ||
            sshUser !== info.sshUser ||
            (keyMode !== 'keep' && !!privateKey.trim()));

    const canSave = isDirty && !!sshHost.trim() && !!sshUser.trim();

    // Above the early returns for the loading and error states, so the hook order does not
    // depend on whether the configuration has arrived yet.
    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const resetFeedback = () => {
        setMessage(null);
        setError(null);
        setUnknownHostKey(null);
    };

    /**
     * Tests the credentials as they stand in the form.
     *
     * Two paths, because the private key is write-only: a key entered here can be tested
     * directly, while the stored one never leaves the backend — there the server reads it
     * from the database and only takes host, port and user from the request.
     */
    const handleTest = async () => {
        setBusy(true);
        resetFeedback();
        try {
            const usesNewKey = keyMode !== 'keep' && !!privateKey.trim();
            const res = usesNewKey
                ? await apiFetch('/api/v1/tunnel/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          sshHost,
                          sshPort: Number(sshPort) || 22,
                          sshUser,
                          privateKey: privateKey.trim(),
                          passphrase: passphrase || undefined,
                          expectedHostKeySha256: info?.hostKeySha256,
                      }),
                  })
                : await apiFetch(`/api/v1/clients/${clientId}/tunnel/test`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          sshHost,
                          sshPort: Number(sshPort) || 22,
                          sshUser,
                      }),
                  });
            const data: TestResult = await res.json();
            if (data.ok) {
                setMessage(
                    `Connection succeeded${data.boundPort ? ` (test port ${data.boundPort})` : ''}`,
                );
                return;
            }
            setError(data.error || 'Tunnel test failed');
            // A key that does not match the pinned one is the one failure the operator can
            // resolve from here, so surface the fingerprint the host actually presented.
            if (data.hostKeySha256 && info && data.hostKeySha256 !== info.hostKeySha256) {
                setUnknownHostKey(data.hostKeySha256);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const saveTunnel = async (body: Record<string, unknown>) => {
        const res = await apiFetch(`/api/v1/clients/${clientId}/tunnel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save the tunnel configuration');
    };

    const handleSave = async () => {
        setBusy(true);
        resetFeedback();
        try {
            const body: Record<string, unknown> = {
                sshHost,
                sshPort: Number(sshPort) || 22,
                sshUser,
            };
            if (keyMode !== 'keep' && privateKey.trim()) {
                body.privateKey = privateKey.trim();
                body.passphrase = keyMode === 'manual' && passphrase ? passphrase : null;
            }
            await saveTunnel(body);
            setInfo((prev) =>
                prev ? { ...prev, sshHost, sshPort: Number(sshPort) || 22, sshUser } : prev,
            );
            setMessage('Tunnel configuration saved');
            setKeyMode('keep');
            setPrivateKey('');
            setPassphrase('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    /** Pins the fingerprint the host presented instead of the one stored. */
    const handleTrustHostKey = async () => {
        if (!unknownHostKey) return;
        setBusy(true);
        try {
            await saveTunnel({ hostKeySha256: unknownHostKey });
            setInfo((prev) => (prev ? { ...prev, hostKeySha256: unknownHostKey } : prev));
            setUnknownHostKey(null);
            setError(null);
            setMessage('New host key pinned — run the test again to confirm.');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const handleCopyFingerprint = async () => {
        if (!info) return;
        try {
            await navigator.clipboard.writeText(info.hostKeySha256);
            setCopied(true);
            setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
        } catch {
            setError('Copy failed — select the fingerprint manually');
        }
    };

    if (loadError) {
        return (
            <Card title="SSH Reverse Tunnel" titleAs="h3" classNames={{ header: 'py-5 px-7' }}>
                <div className="px-7 py-6 bg-card text-sm text-error break-words">{loadError}</div>
            </Card>
        );
    }

    // A short, silent gap would make the card jump into the layout; a placeholder of the
    // same shape keeps the page still.
    if (!info) {
        return (
            <Card title="SSH Reverse Tunnel" titleAs="h3" classNames={{ header: 'py-5 px-7' }}>
                <div className="px-7 py-6 bg-card space-y-3" aria-busy>
                    <div className="h-4 w-1/3 rounded bg-border animate-pulse" />
                    <div className="h-10 w-full rounded bg-border animate-pulse" />
                    <div className="h-10 w-full rounded bg-border animate-pulse" />
                </div>
            </Card>
        );
    }

    const status = state?.status ?? 'idle';

    return (
        <Card
            title={
                /* Dot first, then the name — the same header shape the identity card above
                   uses, so the two connections are read the same way. `span`s throughout:
                   the title is rendered as an `h3`, which may not contain a `div`. */
                <span className="flex items-center gap-4">
                    <StatusDot tone={STATUS_TONE[status]} label={status} />
                    <span>SSH Reverse Tunnel</span>
                </span>
            }
            titleAs="h3"
            action={
                !!state?.activeLeases && (
                    <Badge variant="info" size="sm">
                        {state.activeLeases} lease{state.activeLeases === 1 ? '' : 's'}
                    </Badge>
                )
            }
            classNames={{ header: 'py-5 px-7' }}
        >
            <div className="px-7 py-6 bg-card space-y-6">
                {(state?.forwards?.length || state?.lastUsedAt || state?.lastError) && (
                    <div className="text-xs text-text-muted space-y-1">
                        {state.forwards?.map((f) => (
                            <div key={f.target} className="font-mono break-all">
                                {f.target} → {info.remoteBindHost}:{f.port}
                            </div>
                        ))}
                        {state.lastUsedAt && <div>Last used {formatDate(state.lastUsedAt)}</div>}
                        {state.lastError && <div className="text-error break-words">{state.lastError}</div>}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                        <Input
                            label="SSH Host"
                            value={sshHost}
                            onChange={(e) => { setSshHost(e.target.value); resetFeedback(); }}
                            disabled={busy}
                        />
                    </div>
                    <Input
                        label="Port"
                        value={sshPort}
                        onChange={(e) => { setSshPort(e.target.value); resetFeedback(); }}
                        disabled={busy}
                    />
                </div>
                <Input
                    label="SSH User"
                    value={sshUser}
                    onChange={(e) => { setSshUser(e.target.value); resetFeedback(); }}
                    disabled={busy}
                />

                <SshKeyFields
                    token={token}
                    allowKeep
                    mode={keyMode}
                    onModeChange={(m) => { setKeyMode(m); setPrivateKey(''); setPassphrase(''); resetFeedback(); }}
                    privateKey={privateKey}
                    onPrivateKeyChange={setPrivateKey}
                    passphrase={passphrase}
                    onPassphraseChange={setPassphrase}
                />

                {/* Only shown once a key is in hand: the snippet derives its public half
                    from it, and the stored key never leaves the backend — so in 'keep'
                    mode it could only render a command with an empty key in it. */}
                {keyMode !== 'keep' && (
                    <SshHostSetupSnippet
                        token={token}
                        privateKey={privateKey}
                        passphrase={passphrase}
                        sshUser={sshUser}
                    />
                )}

                <div className="space-y-1">
                    <div className="text-xs text-text-muted">Pinned host key (SHA256)</div>
                    {/* `items-center`, not `items-start`: the fingerprint may wrap on a
                        narrow card, and the button belongs to the value as a whole rather
                        than to its first line. `shrink-0` keeps it from being squeezed
                        while the value takes the wrapping. */}
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs break-all text-text-primary">
                            {info.hostKeySha256}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={handleCopyFingerprint}
                            icon={copied ? Check : Copy}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                    </div>
                </div>

                {unknownHostKey && (
                    <div className="rounded border border-error p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm text-error">
                            <ShieldAlert size={16} aria-hidden />
                            The host presented a different key than the one pinned
                        </div>
                        <div>
                            <div className="text-xs text-text-muted mb-1">Presented (SHA256)</div>
                            <div className="font-mono text-xs break-all text-text-primary">
                                {unknownHostKey}
                            </div>
                        </div>
                        <p className="text-xs text-text-muted">
                            Expected after the client host was reinstalled or its SSH keys were
                            regenerated. Otherwise this can mean someone else is answering on
                            that address — verify the fingerprint on the host itself before
                            trusting it.
                        </p>
                        <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={handleTrustHostKey}
                            disabled={busy}
                            icon={ShieldAlert}
                        >
                            Trust this host key
                        </Button>
                    </div>
                )}

                <div className="flex items-center justify-end gap-4 border-t border-border pt-5">
                    {error && <span className="text-sm text-error break-words mr-auto">{error}</span>}
                    {!error && message && <span className="text-sm text-success mr-auto">{message}</span>}
                    <Button type="button" variant="secondary" onClick={handleTest} disabled={busy} icon={PlugZap}>
                        Test Connection
                    </Button>
                    <Button type="button" variant="primary" onClick={handleSave} disabled={busy || !canSave} icon={Save}>
                        Save Tunnel
                    </Button>
                </div>
            </div>
        </Card>
    );
};
