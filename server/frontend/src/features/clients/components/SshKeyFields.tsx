import { useId, useState } from 'react';
import { KeyRound, Check } from 'lucide-react';
import { Button, Input } from '@stefgo/react-ui-components';
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
            if (!raw) throw new Error(`Server nicht erreichbar (HTTP ${res.status})`);
            const data = JSON.parse(raw);
            if (!res.ok) throw new Error(data.error || 'Schlüssel konnte nicht erzeugt werden');
            onPrivateKeyChange(data.privateKey);
            onPassphraseChange('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const options: { value: SshKeyMode; label: string }[] = [
        ...(allowKeep ? [{ value: 'keep' as const, label: 'Hinterlegten Schlüssel behalten' }] : []),
        { value: 'generate', label: 'Schlüssel erzeugen lassen' },
        { value: 'manual', label: 'Eigenen Schlüssel einfügen' },
    ];

    return (
        <div className="space-y-3">
            <div className="text-sm font-medium text-text-primary dark:text-text-primary-dark">
                Schlüssel
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
                {options.map((o) => (
                    <label
                        key={o.value}
                        className="flex items-center gap-2 text-sm text-text-primary dark:text-text-primary-dark cursor-pointer"
                    >
                        <input
                            type="radio"
                            name={groupName}
                            value={o.value}
                            checked={mode === o.value}
                            onChange={() => { setError(null); onModeChange(o.value); }}
                        />
                        {o.label}
                    </label>
                ))}
            </div>

            {mode === 'keep' && (
                <p className="text-xs text-text-muted dark:text-text-muted-dark">
                    Der gespeicherte Schlüssel bleibt unverändert.
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
                        icon={<KeyRound size={16} />}
                    >
                        {generated ? 'Neu erzeugen' : 'Schlüsselpaar erzeugen'}
                    </Button>
                    {generated && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                            <Check size={16} />
                            ed25519-Schlüssel erzeugt
                        </div>
                    )}
                    <p className="text-xs text-text-muted dark:text-text-muted-dark">
                        Ohne Passphrase — der Server nutzt den Schlüssel unbeaufsichtigt. Er wird nur
                        gespeichert, nie wieder ausgegeben.
                    </p>
                </div>
            )}

            {mode === 'manual' && (
                <div className="space-y-3">
                    <textarea
                        value={privateKey}
                        onChange={(e) => onPrivateKeyChange(e.target.value)}
                        rows={5}
                        spellCheck={false}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        className="w-full font-mono text-xs p-2 rounded border border-border dark:border-border-dark bg-card dark:bg-card-dark text-text-primary dark:text-text-primary-dark"
                    />
                    <Input
                        label="Passphrase (optional)"
                        type="password"
                        value={passphrase}
                        onChange={(e) => onPassphraseChange(e.target.value)}
                    />
                </div>
            )}

            {error && <div className="text-sm text-red-600 dark:text-red-400 break-words">{error}</div>}
        </div>
    );
};
