import { ReactNode, useState } from 'react';
import {
    TUNNEL_STATUS,
    TunnelUpdateSchema,
    type TunnelInfo,
    type TunnelState,
    type TunnelStatus,
} from '@pbcm/shared';
import { Check, Copy, PlugZap, Plus, Save, ShieldAlert, Trash2, X } from 'lucide-react';
import { ActionButton, Badge, Button, Card, Input, useConfirm, StatusDot, LoadingIndicator, useCopyToClipboard } from '@stefgo/react-ui-components';
import { useQuery } from '@tanstack/react-query';
import {
    clientTunnelOptions,
    testStoredTunnel,
    testTunnelCredentials,
    useCreateTunnel,
    useDeleteTunnel,
    useUpdateTunnel,
} from '../../../queries/clients';
import { STATUS_DOT, STATUS_TONE, type StatusTone } from '../../../components/statusTone';
import { useEntityForm } from '../../../hooks/useEntityForm';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import { SshKeyFields } from './SshKeyFields';
import { SshHostSetupSnippet } from './SshHostSetupSnippet';
import { formatDate, getErrorMessage } from '../../../utils';
import { describeRemoveTunnel } from '../confirmations';
import {
    NewTunnelSchema,
    carriesNewKey,
    newTunnelInputFrom,
    significantTunnelDraft,
    sshPortFrom,
    storedTunnelDraft,
    tunnelDraftFrom,
    tunnelFieldOf,
    tunnelRules,
    tunnelUpdateInputFrom,
    type TunnelDraft,
} from '../lib/tunnelForm';

interface ClientTunnelCardProps {
    clientId: string;
    /**
     * Display name of the client, rendered under the card title. The page used to carry a
     * heading of its own for this; it sits in the header now, where {@link ClientIdentityCard}
     * keeps the same information — one title per surface, and it stays in reach while the
     * form scrolls.
     */
    clientName?: string;
    /** Live state from the cached client list — kept current by TUNNEL_UPDATE over the socket. */
    state?: TunnelState;
}

/**
 * The tunnel has four states where a client has two, but they map onto the same indicator —
 * the point of showing it the same way is that "is this connection up" is answered in one
 * place and one idiom on every client surface.
 */
const TUNNEL_STATUS_TONE: Record<TunnelStatus, StatusTone> = {
    [TUNNEL_STATUS.UP]: STATUS_TONE.ONLINE,
    [TUNNEL_STATUS.CONNECTING]: STATUS_TONE.CONNECTING,
    [TUNNEL_STATUS.ERROR]: STATUS_TONE.ERROR,
    [TUNNEL_STATUS.IDLE]: STATUS_TONE.OFFLINE,
};

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
 *
 * It also owns its way out, in every state: the X in its header, asking about unsaved
 * credentials first -- a half-pasted private key is not retyped from memory.
 */
/**
 * The card in every state it has: the heading, the client it belongs to on the line
 * beneath it, and the way out. Built once, so the header does not change shape when the
 * configuration arrives. Same stack as {@link ClientIdentityCard} — `span`s throughout,
 * because the title is rendered as an `h3`, which may not contain a `div`.
 */
const TunnelCardShell = ({
    clientId,
    clientName,
    state,
    hasTunnel,
    action,
    children,
}: ClientTunnelCardProps & { hasTunnel: boolean; action: ReactNode; children: ReactNode }) => (
    <Card
        title={
            <span className="flex items-center gap-4">
                {/* Only once there is a tunnel: a dot on a card that is a setup form
                    would report the state of something that does not exist. */}
                {hasTunnel && <StatusDot size="md" {...STATUS_DOT[TUNNEL_STATUS_TONE[state?.status ?? 'idle']]} label={state?.status ?? 'idle'} />}
                <span>
                    <span className="block text-xl font-bold">SSH Reverse Tunnel</span>
                    <span className="block text-sm font-normal text-text-muted">
                        {clientName}
                        <span className="font-mono text-xs ml-2 opacity-70">{clientId}</span>
                    </span>
                </span>
            </span>
        }
        titleAs="h3"
        action={action}
        classNames={{ header: 'py-5 px-7' }}
    >
        {children}
    </Card>
);

/**
 * The way out of a card that holds no form yet. Rendered in the loading and the error
 * state too, so a stuck request never traps the operator on the page.
 */
const ClosePage = () => {
    const { close } = useUnsavedChangesGuard(false, 'tunnel');
    return <ActionButton icon={X} tooltip="Close" onClick={close} />;
};

export const ClientTunnelCard = (props: ClientTunnelCardProps) => {
    const { clientId } = props;
    /**
     * `isPending` distinguishes "no answer yet" from "this client has no tunnel", which
     * arrives as `null`. The key carries the client, so switching clients is pending again
     * on that same render and an answer for the previous client cannot pass for this one.
     */
    const { data, isPending, error } = useQuery(clientTunnelOptions(clientId));

    if (error) {
        return (
            <TunnelCardShell {...props} hasTunnel={false} action={<ClosePage />}>
                <div className="px-7 py-6 bg-card text-sm text-error break-words">{getErrorMessage(error)}</div>
            </TunnelCardShell>
        );
    }

    // A short, silent gap would read as an empty card; the one loading indicator says
    // what is on its way without inventing a second loading idiom.
    if (isPending) {
        return (
            <TunnelCardShell {...props} hasTunnel={false} action={<ClosePage />}>
                <div className="px-7 py-6 bg-card" aria-busy>
                    <LoadingIndicator label="Loading tunnel…" />
                </div>
            </TunnelCardShell>
        );
    }

    // Mounted with the first answer for a client, which fills the form. A later answer --
    // the cache is read again after a reconnect -- reaches the form as `info` only, and
    // does not overwrite what is being typed. Keyed by the client, so no frame shows the
    // previous client's fields.
    return <TunnelForm key={clientId} {...props} info={data} />;
};

/**
 * The form of the card, once the server has said what it holds. Two states: no credentials
 * yet (`info` is `null`, the form creates them) and credentials stored.
 *
 * The draft is the fields; everything else the card keeps -- the outcome of a test, a host
 * key the host presented, the "copied" tick -- describes an action taken from the form and
 * is no part of what it saves.
 */
const TunnelForm = ({ info, ...props }: ClientTunnelCardProps & { info: TunnelInfo | null }) => {
    const { clientId, state } = props;
    const isNew = !info;
    const { confirm } = useConfirm();
    const { mutateAsync: createTunnel } = useCreateTunnel(clientId);
    const { mutateAsync: updateTunnel } = useUpdateTunnel(clientId);
    const { mutateAsync: deleteTunnel } = useDeleteTunnel(clientId);

    // Which schema applies changes with the state of the card: a setup form is checked as
    // the credentials of a new tunnel, a loaded one as an update.
    const form = useEntityForm<TunnelDraft, typeof NewTunnelSchema | typeof TunnelUpdateSchema>({
        schema: isNew ? NewTunnelSchema : TunnelUpdateSchema,
        initial: () => tunnelDraftFrom(info),
        toInput: (draft) => (isNew ? newTunnelInputFrom(draft) : tunnelUpdateInputFrom(draft)),
        fieldOf: tunnelFieldOf,
        rules: (draft) => tunnelRules(draft, isNew),
        significant: significantTunnelDraft,
    });
    const { draft, errors } = form;
    const { close } = useUnsavedChangesGuard(form.isDirty, 'tunnel');

    const [acting, setActing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const { copied, copy } = useCopyToClipboard();
    /** A fingerprint the host actually presented that differs from the stored one. */
    const [unknownHostKey, setUnknownHostKey] = useState<string | null>(null);

    const busy = acting || form.isSaving;

    const resetFeedback = () => {
        setMessage(null);
        setActionError(null);
        setUnknownHostKey(null);
    };

    // What a test or a save said described the fields as they were.
    const change = (changes: Partial<TunnelDraft>) => {
        resetFeedback();
        form.patch(changes);
    };

    /**
     * Tests the credentials as they stand in the form.
     *
     * Two paths, because the private key is write-only: a key entered here can be tested
     * directly, while the stored one never leaves the backend — there the server reads it
     * from the database and only takes host, port and user from the request.
     */
    const handleTest = async () => {
        setActing(true);
        resetFeedback();
        try {
            const result = carriesNewKey(draft)
                ? await testTunnelCredentials({
                      ...newTunnelInputFrom(draft),
                      expectedHostKeySha256: info?.hostKeySha256,
                  })
                : await testStoredTunnel(clientId, {
                      sshHost: draft.sshHost,
                      sshPort: sshPortFrom(draft.sshPort),
                      sshUser: draft.sshUser,
                  });
            if (result.ok) {
                setMessage(
                    `Connection succeeded${result.boundPort ? ` (test port ${result.boundPort})` : ''}`,
                );
                return;
            }
            setActionError(result.error || 'Tunnel test failed');
            // A key that does not match the pinned one is the one failure the operator can
            // resolve from here, so surface the fingerprint the host actually presented.
            if (result.hostKeySha256 && info && result.hostKeySha256 !== info.hostKeySha256) {
                setUnknownHostKey(result.hostKeySha256);
            }
        } catch (e) {
            setActionError(getErrorMessage(e));
        } finally {
            setActing(false);
        }
    };

    /**
     * Sets up a tunnel for a client that has none — test and create in one action, the
     * same pairing the add-client wizard uses: the fingerprint being pinned is the one
     * this very test was offered, and the backend verifies it again against the key the
     * host actually presents, so a host that swaps keys in between fails the create.
     */
    const handleCreate = async () => {
        resetFeedback();
        const created = await form.submit(
            async () => {
                const credentials = newTunnelInputFrom(draft);
                const test = await testTunnelCredentials(credentials);
                if (!test.ok || !test.hostKeySha256) {
                    throw new Error(test.error || 'Tunnel test failed');
                }
                await createTunnel({ ...credentials, hostKeySha256: test.hostKeySha256 });
            },
            { rebase: storedTunnelDraft },
        );
        if (created) setMessage('Tunnel set up — a job can now be configured to use it.');
    };

    const handleSave = async () => {
        resetFeedback();
        const saved = await form.submit(() => updateTunnel(tunnelUpdateInputFrom(draft)), {
            rebase: storedTunnelDraft,
        });
        if (saved) setMessage('Tunnel configuration saved');
    };

    // Runs inside the confirmation, which shows a refusal next to the button that retries.
    const removeTunnel = async () => {
        setActing(true);
        resetFeedback();
        try {
            await deleteTunnel();
            form.reset(tunnelDraftFrom(null));
            setMessage('Tunnel removed. Jobs still configured for it will now fail.');
        } finally {
            setActing(false);
        }
    };

    const handleDelete = () => confirm({ ...describeRemoveTunnel(), onConfirm: removeTunnel });

    /** Pins the fingerprint the host presented instead of the one stored. */
    const handleTrustHostKey = async () => {
        if (!unknownHostKey) return;
        setActing(true);
        try {
            await updateTunnel({ hostKeySha256: unknownHostKey });
            setUnknownHostKey(null);
            setActionError(null);
            setMessage('New host key pinned — run the test again to confirm.');
        } catch (e) {
            setActionError(getErrorMessage(e));
        } finally {
            setActing(false);
        }
    };

    const handleCopyFingerprint = async () => {
        if (!info) return;
        if (!(await copy(info.hostKeySha256))) setActionError('Copy failed — select the fingerprint manually');
    };

    /**
     * Handles the form's submit so Enter in a field does what the primary button does —
     * the arrangement {@link ClientIdentityCard} and the other editors use. Which action
     * that is depends on the state the card is in: a setup form creates, a loaded one saves.
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (isNew) {
            handleCreate();
            return;
        }
        handleSave();
    };

    const error = form.saveError ?? form.formError ?? actionError;

    return (
        <TunnelCardShell
            {...props}
            hasTunnel={!!info}
            action={
                /* The badge describes the tunnel, the control beside it leaves the page —
                   read left to right, the state comes before the way out. */
                <span className="flex items-center gap-3">
                    {info && !!state?.activeLeases && (
                        <Badge variant="info" size="sm">
                            {state.activeLeases} lease{state.activeLeases === 1 ? '' : 's'}
                        </Badge>
                    )}
                    <ActionButton icon={X} tooltip="Close" onClick={close} />
                </span>
            }
        >
            <div className="px-7 py-6 bg-card">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <p className="text-sm text-text-muted">
                        {isNew
                            ? 'Optional. Set one up when this host cannot reach a PBS itself — the server then opens an SSH reverse forward to it for the duration of a run. Independent of the connection mode: a client that dials the server can use one just as well.'
                            : 'These credentials make the tunnel available to this client. Which backups take it is set per job, in the job editor.'}
                    </p>

                    {info && (state?.forwards?.length || state?.lastUsedAt || state?.lastError) && (
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
                                value={draft.sshHost}
                                onChange={(e) => change({ sshHost: e.target.value })}
                                error={errors.sshHost}
                                disabled={busy}
                            />
                        </div>
                        <Input
                            label="Port"
                            value={draft.sshPort}
                            onChange={(e) => change({ sshPort: e.target.value })}
                            error={errors.sshPort}
                            disabled={busy}
                        />
                    </div>
                    <Input
                        label="SSH User"
                        value={draft.sshUser}
                        onChange={(e) => change({ sshUser: e.target.value })}
                        error={errors.sshUser}
                        disabled={busy}
                    />

                    <SshKeyFields
                        allowKeep={!isNew}
                        mode={draft.keyMode}
                        onModeChange={(keyMode) => change({ keyMode, privateKey: '', passphrase: '' })}
                        privateKey={draft.privateKey}
                        onPrivateKeyChange={(privateKey) => form.set('privateKey', privateKey)}
                        passphrase={draft.passphrase}
                        onPassphraseChange={(passphrase) => form.set('passphrase', passphrase)}
                        error={errors.privateKey}
                    />

                    {/* Only shown once a key is in hand: the snippet derives its public half
                        from it, and the stored key never leaves the backend — so in 'keep'
                        mode it could only render a command with an empty key in it. */}
                    {draft.keyMode !== 'keep' && (
                        <SshHostSetupSnippet
                            privateKey={draft.privateKey}
                            passphrase={draft.passphrase}
                            sshUser={draft.sshUser}
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
                                onClick={handleDelete}
                                disabled={busy}
                                icon={Trash2}
                            >
                                Remove
                            </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={handleTest} disabled={busy || !form.isValid} icon={PlugZap}>
                            Test Connection
                        </Button>
                        {/* `submit`, so Enter in any field triggers it — `handleSubmit` picks
                            the same action this button carries. */}
                        {isNew ? (
                            <Button type="submit" variant="primary" disabled={busy || !form.canSave} icon={Plus} className="shadow-glow-accent">
                                Test &amp; Set Up
                            </Button>
                        ) : (
                            <Button type="submit" variant="primary" disabled={busy || !form.canSave} icon={Save} className="shadow-glow-accent">
                                Save Tunnel
                            </Button>
                        )}
                    </div>
                </form>
            </div>
        </TunnelCardShell>
    );
};
