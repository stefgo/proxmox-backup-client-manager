import { useEffect, useState } from 'react';
import { TunnelState, TunnelStatus } from '@pbcm/shared';
import { Check, Copy, PlugZap, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, Input } from '@stefgo/react-ui-components';
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
 * The SSH credentials with which the server opens a reverse tunnel to this client — and
 * nothing more. Stored means the tunnel is *available*; which backups take it is set per
 * job in the job editor, because one client can have a PBS it reaches directly and
 * another it only reaches through the detour.
 *
 * Shown for every client, in either connection mode. The tunnel answers a different
 * question than the mode does — the mode is who dials the WebSocket, this is how the PBS
 * is reached — so an inbound client with no route to the PBS can have one, and an outbound
 * client that reaches the PBS itself can do without.
 *
 * Two states, one card: no credentials yet (the form creates them) and credentials stored.
 * Deliberately limited: tunnel target and bind port are not editable — the target follows
 * from each job's repository, the port is allocated per forward.
 *
 * The card owns its own save button because the credentials are their own endpoint. The
 * test button sends the *form* values, not the stored ones, so a green result always
 * describes what is on screen.
 */
export const ClientTunnelCard = ({ clientId, state, onDirtyChange }: ClientTunnelCardProps) => {
    const { token } = useAuth();
    const [info, setInfo] = useState<TunnelInfo | null>(null);
    /** Distinguishes "not loaded yet" from "this client has no tunnel" — 404 is an answer. */
    const [loaded, setLoaded] = useState(false);
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
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiFetch(`/api/v1/clients/${clientId}/tunnel`);
                // Not an error: a client without a tunnel is an ordinary state now, and
                // the card offers to set one up instead of reporting a failure.
                if (res.status === 404) {
                    setInfo(null);
                    setKeyMode('generate');
                    return;
                }
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `Could not load the tunnel configuration (HTTP ${res.status})`);
                setInfo(data);
                setSshHost(data.sshHost);
                setSshPort(String(data.sshPort));
                setSshUser(data.sshUser);
                setKeyMode('keep');
            } catch (e) {
                setLoadError(e instanceof Error ? e.message : String(e));
            } finally {
                setLoaded(true);
            }
        };
        setLoaded(false);
        load();
    }, [clientId, token]);

    /** Loaded, no configuration, nothing broken: the card is a setup form. */
    const isNew = loaded && !info && !loadError;

    const isDirty = info
        ? sshHost !== info.sshHost ||
          sshPort !== String(info.sshPort) ||
          sshUser !== info.sshUser ||
          (keyMode !== 'keep' && !!privateKey.trim())
        : // A half-filled setup form is worth warning about on the way out just as much
          // as an edited one.
          !!sshHost.trim() || !!sshUser.trim() || !!privateKey.trim();

    const complete = !!sshHost.trim() && !!sshUser.trim();
    const canSave = isNew ? complete && !!privateKey.trim() : isDirty && complete;

    // Testing without a key in the form falls back to the stored credentials, and a client
    // that has none answers with a message about the very tunnel being set up here. Ask for
    // the key first rather than explaining the setup back to the operator.
    const canTest = complete && (!isNew || !!privateKey.trim());

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

    /**
     * Sets up a tunnel for a client that has none — test and create in one action, the
     * same pairing the add-client wizard uses: the fingerprint being pinned is the one
     * this very test was offered, and the backend verifies it again against the key the
     * host actually presents, so a host that swaps keys in between fails the create.
     */
    const handleCreate = async () => {
        setBusy(true);
        resetFeedback();
        try {
            const testRes = await apiFetch('/api/v1/tunnel/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sshHost,
                    sshPort: Number(sshPort) || 22,
                    sshUser,
                    privateKey: privateKey.trim(),
                    passphrase: passphrase || undefined,
                }),
            });
            const test: TestResult = await testRes.json();
            if (!test.ok || !test.hostKeySha256) {
                throw new Error(test.error || 'Tunnel test failed');
            }

            const res = await apiFetch(`/api/v1/clients/${clientId}/tunnel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sshHost,
                    sshPort: Number(sshPort) || 22,
                    sshUser,
                    privateKey: privateKey.trim(),
                    passphrase: keyMode === 'manual' && passphrase ? passphrase : undefined,
                    hostKeySha256: test.hostKeySha256,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to set up the tunnel');

            setInfo({
                sshHost,
                sshPort: Number(sshPort) || 22,
                sshUser,
                hostKeySha256: test.hostKeySha256,
                remoteBindHost: '127.0.0.1',
            });
            setKeyMode('keep');
            setPrivateKey('');
            setPassphrase('');
            setMessage('Tunnel set up — a job can now be configured to use it.');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    /** Removes the tunnel with its credentials. The client and its history stay. */
    const handleDelete = async () => {
        setBusy(true);
        resetFeedback();
        try {
            const res = await apiFetch(`/api/v1/clients/${clientId}/tunnel`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to remove the tunnel');
            setInfo(null);
            setSshHost('');
            setSshPort('22');
            setSshUser('');
            setKeyMode('generate');
            setPrivateKey('');
            setPassphrase('');
            setConfirmDelete(false);
            setMessage('Tunnel removed. Jobs still configured for it will now fail.');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
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
    if (!loaded) {
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
                    {/* Only once there is a tunnel: a dot on a card that is a setup form
                        would report the state of something that does not exist. */}
                    {info && <StatusDot tone={STATUS_TONE[status]} label={status} />}
                    <span>SSH Reverse Tunnel</span>
                </span>
            }
            titleAs="h3"
            action={
                info ? (
                    <span className="flex items-center gap-3">
                        {!!state?.activeLeases && (
                            <Badge variant="info" size="sm">
                                {state.activeLeases} lease{state.activeLeases === 1 ? '' : 's'}
                            </Badge>
                        )}
                    </span>
                ) : undefined
            }
            classNames={{ header: 'py-5 px-7' }}
        >
            <div className="px-7 py-6 bg-card space-y-6">
                <p className="text-sm text-text-muted">
                    {isNew
                        ? 'Optional. Set one up when this host cannot reach a PBS itself — the server then opens an SSH reverse forward to it for the duration of a run. Independent of the connection mode: a client that dials the server can use one just as well.'
                        : 'These credentials make the tunnel available to this client. Which backups take it is set per job, in the job editor.'}
                </p>

                {info && (state?.forwards?.length || state?.lastUsedAt || state?.lastError) && (
                    <div className="text-xs text-text-muted space-y-1">
                        {state.forwards?.map((f) => (
                            <div key={f.target} className="font-mono break-all">
                                {f.target} → {info!.remoteBindHost}:{f.port}
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
                    allowKeep={!isNew}
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

                {info && (
                <div className="space-y-1">
                    <div className="text-xs text-text-muted">Pinned host key (SHA256)</div>
                    {/* `items-center`, not `items-start`: the fingerprint may wrap on a
                        narrow card, and the button belongs to the value as a whole rather
                        than to its first line. `shrink-0` keeps it from being squeezed
                        while the value takes the wrapping. */}
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs break-all text-text-primary">
                            {info!.hostKeySha256}
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
                )}

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

                <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-5">
                    {error && <span className="text-sm text-error break-words mr-auto">{error}</span>}
                    {!error && message && <span className="text-sm text-success mr-auto">{message}</span>}
                    {/* Removing is destructive and belongs nowhere near the primary action,
                        so it sits on the far left with the messages between. */}
                    {info && !error && !message && <span className="mr-auto" />}
                    {info && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setConfirmDelete(true)}
                            disabled={busy}
                            icon={Trash2}
                        >
                            Remove
                        </Button>
                    )}
                    <Button type="button" variant="secondary" onClick={handleTest} disabled={busy || !canTest} icon={PlugZap}>
                        Test Connection
                    </Button>
                    {isNew ? (
                        <Button type="button" variant="primary" onClick={handleCreate} disabled={busy || !canSave} icon={Plus}>
                            Test &amp; Set Up
                        </Button>
                    ) : (
                        <Button type="button" variant="primary" onClick={handleSave} disabled={busy || !canSave} icon={Save}>
                            Save Tunnel
                        </Button>
                    )}
                </div>

                <ConfirmDialog
                    isOpen={confirmDelete}
                    onClose={() => setConfirmDelete(false)}
                    onConfirm={handleDelete}
                    title="Remove the SSH tunnel?"
                    description="The stored key is deleted with it. Runs go directly to the PBS from then on — which fails for a host that has no route there. The client and its history stay."
                    confirmLabel="Remove tunnel"
                    variant="danger"
                    isConfirming={busy}
                />
            </div>
        </Card>
    );
};
