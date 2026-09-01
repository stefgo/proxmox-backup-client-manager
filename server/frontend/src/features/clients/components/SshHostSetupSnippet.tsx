import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Copy } from 'lucide-react';
import { Button } from '@stefgo/react-ui-components';
import { apiFetch } from '../../../lib/apiFetch';

interface SshHostSetupSnippetProps {
    token: string | null;
    privateKey: string;
    passphrase?: string;
    sshUser: string;
}

const COPY_FEEDBACK_MS = 2000;

/**
 * Optional aid for preparing the client host. Collapsed by default and placed above the
 * connection test on purpose: the authorized_keys entry has to exist before the test can
 * succeed. The public key is derived on demand, so it works for generated and pasted keys
 * alike — and the private key is only sent once the operator actually opens the section.
 */
export const SshHostSetupSnippet = ({
    privateKey,
    passphrase,
    sshUser,
}: SshHostSetupSnippetProps) => {
    const [open, setOpen] = useState(false);
    const [publicKey, setPublicKey] = useState('');
    /** Which private key the shown public key belongs to — avoids re-deriving unchanged input. */
    const [derivedFor, setDerivedFor] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const derive = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await apiFetch('/api/v1/tunnel/pubkey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ privateKey, passphrase: passphrase || undefined }),
            });
            const raw = await res.text();
            if (!raw) throw new Error(`Server not reachable (HTTP ${res.status})`);
            const data = JSON.parse(raw);
            if (!res.ok) throw new Error(data.error || 'Could not derive the public key');
            setPublicKey(data.publicKey);
            setDerivedFor(privateKey);
        } catch (e) {
            setPublicKey('');
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next && privateKey && privateKey !== derivedFor && !busy) derive();
    };

    const user = sshUser.trim() || '<ssh-benutzer>';
    const snippet = [
        `# Run on the client host as user "${user}":`,
        'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
        `echo 'restrict,port-forwarding,permitlisten="127.0.0.1:*" ${publicKey}' \\`,
        '  >> ~/.ssh/authorized_keys',
        'chmod 600 ~/.ssh/authorized_keys',
    ].join('\n');

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
        } catch {
            setError('Copy failed — select the text manually');
        }
    };

    return (
        <div className="rounded border border-border">
            <button
                type="button"
                onClick={handleToggle}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-text-primary"
            >
                <span className="text-text-muted">
                    {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                Einrichtung auf dem Client-Host (optional)
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {!privateKey && (
                        <p className="text-xs text-text-muted">
                            Generate or paste a key above first.
                        </p>
                    )}

                    {busy && (
                        <p className="text-xs text-text-muted">
                            Deriving public key …
                        </p>
                    )}

                    {error && (
                        <div className="text-sm text-red-600 dark:text-red-400 break-words">{error}</div>
                    )}

                    {publicKey && (
                        <>
                            <pre className="overflow-x-auto rounded bg-card p-3 font-mono text-xs text-text-primary">
                                {snippet}
                            </pre>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleCopy}
                                icon={copied ? Check : Copy}
                            >
                                {copied ? 'Copied' : 'Copy Snippet'}
                            </Button>
                            <p className="text-xs text-text-muted">
                                <span className="font-mono">sshd_config</span> needs{' '}
                                <span className="font-mono">AllowTcpForwarding yes</span>, which is the
                                default. <span className="font-mono">GatewayPorts</span> is not required.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
