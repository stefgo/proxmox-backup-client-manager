import { useId, useState } from 'react';
import { KeyRound, Check } from 'lucide-react';
import { Button, Input, RadioGroup, Radio, Textarea } from '@stefgo/react-ui-components';
import { apiFetch } from '../../../lib/apiFetch';

export type SshKeyMode = 'keep' | 'generate' | 'manual';

interface SshKeyFieldsProps {
    token: string | null;
    mode: SshKeyMode;
    onModeChange: (mode: SshKeyMode) => void;
    privateKey: string;
    onPrivateKeyChange: (value: string) => void;
    passphrase: string;
    onPassphraseChange: (value: string) => void;
    /** Adds "keep the stored key" as the preselected option — for the editor. */
    allowKeep?: boolean;
}

/**
 * Picks how the server authenticates against the client host: generate a key here or paste
 * an existing one. The two paths are mutually exclusive, so only the fields belonging to the
 * chosen one are shown — a generated key has no passphrase, and a pasted one needs no button.
 */
export const SshKeyFields = ({
    mode,
    onModeChange,
    privateKey,
    onPrivateKeyChange,
    passphrase,
    onPassphraseChange,
    allowKeep = false,
}: SshKeyFieldsProps) => {
    const groupName = useId();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // In generate mode a filled field can only come from the button below.
    const generated = mode === 'generate' && !!privateKey;

    const handleGenerate = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await apiFetch('/api/v1/tunnel/keypair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const raw = await res.text();
            if (!raw) throw new Error(`Server not reachable (HTTP ${res.status})`);
            const data = JSON.parse(raw);
            if (!res.ok) throw new Error(data.error || 'Could not generate key pair');
            onPrivateKeyChange(data.privateKey);
            onPassphraseChange('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const options: { value: SshKeyMode; label: string }[] = [
        ...(allowKeep ? [{ value: 'keep' as const, label: 'Keep stored key' }] : []),
        { value: 'generate', label: 'Generate a key' },
        { value: 'manual', label: 'Paste your own key' },
    ];

    return (
        <div className="space-y-3">
            <RadioGroup
                label="Key"
                name={groupName}
                orientation="horizontal"
                value={mode}
                onChange={(next) => { setError(null); onModeChange(next as SshKeyMode); }}
            >
                {options.map((o) => (
                    <Radio key={o.value} value={o.value} label={o.label} />
                ))}
            </RadioGroup>

            {mode === 'keep' && (
                <p className="text-xs text-text-muted">
                    The stored key stays unchanged.
                </p>
            )}

            {mode === 'generate' && (
                <div className="space-y-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleGenerate}
                        disabled={busy}
                        isLoading={busy}
                        icon={KeyRound}
                    >
                        {generated ? 'Regenerate' : 'Generate Key Pair'}
                    </Button>
                    {generated && (
                        <div className="flex items-center gap-2 text-sm text-success">
                            <Check size={16} />
                            ed25519 key generated
                        </div>
                    )}
                    <p className="text-xs text-text-muted">
                        No passphrase — the server uses the key unattended. It is only stored,
                        never handed back out.
                    </p>
                </div>
            )}

            {mode === 'manual' && (
                <div className="space-y-3">
                    <Textarea
                        label="Private Key"
                        required
                        value={privateKey}
                        onChange={(e) => onPrivateKeyChange(e.target.value)}
                        rows={5}
                        spellCheck={false}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        classNames={{ textarea: 'font-mono text-xs' }}
                    />
                    <Input
                        label="Passphrase (optional)"
                        type="password"
                        value={passphrase}
                        onChange={(e) => onPassphraseChange(e.target.value)}
                    />
                </div>
            )}

            {error && <div className="text-sm text-error break-words">{error}</div>}
        </div>
    );
};
