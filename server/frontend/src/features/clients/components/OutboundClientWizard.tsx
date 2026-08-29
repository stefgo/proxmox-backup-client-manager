import { useState } from 'react';
import { Plug, X, ShieldCheck, PlugZap } from 'lucide-react';
import { Card, Button, Input } from '@stefgo/react-ui-components';

interface OutboundClientWizardProps {
    token: string | null;
    onClose: () => void;
    onCreated: () => void;
}

interface TestResult {
    ok: boolean;
    hostKeySha256?: string;
    boundPort?: number;
    error?: string;
}

/**
 * Creates an outbound client. Connection mode and SSH tunnel are captured in one step
 * on purpose: an outbound client without a working tunnel has no route to the PBS, and
 * the mode cannot be changed afterwards.
 */
export const OutboundClientWizard = ({ token, onClose, onCreated }: OutboundClientWizardProps) => {
    const [hostname, setHostname] = useState('');
    const [targetAddress, setTargetAddress] = useState('');
    const [registrationSecret, setRegistrationSecret] = useState('');
    const [sshHost, setSshHost] = useState('');
    const [sshPort, setSshPort] = useState('22');
    const [sshUser, setSshUser] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [passphrase, setPassphrase] = useState('');

    const [testing, setTesting] = useState(false);
    const [creating, setCreating] = useState(false);
    const [test, setTest] = useState<TestResult | null>(null);
    const [fingerprintConfirmed, setFingerprintConfirmed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Any change to the SSH parameters invalidates a previous test — otherwise one could
    // confirm a fingerprint for one host and then create the client against another.
    const invalidateTest = () => {
        setTest(null);
        setFingerprintConfirmed(false);
    };

    const handleTest = async () => {
        setTesting(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/tunnel/test', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sshHost,
                    sshPort: Number(sshPort) || 22,
                    sshUser,
                    privateKey,
                    passphrase: passphrase || undefined,
                }),
            });
            const data = await res.json();
            setTest(data);
            if (!data.ok) setError(data.error || 'Tunneltest fehlgeschlagen');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setTesting(false);
        }
    };

    const handleCreate = async () => {
        if (!test?.ok || !test.hostKeySha256 || !fingerprintConfirmed) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/clients/outbound', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostname: hostname.trim() || undefined,
                    outboundTargetAddress: targetAddress.trim(),
                    registrationSecret: registrationSecret.trim(),
                    tunnel: {
                        sshHost,
                        sshPort: Number(sshPort) || 22,
                        sshUser,
                        privateKey,
                        passphrase: passphrase || undefined,
                        hostKeySha256: test.hostKeySha256,
                    },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Anlegen fehlgeschlagen');
            onCreated();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setCreating(false);
        }
    };

    const canTest = sshHost && sshUser && privateKey && !testing;
    const canCreate =
        !!test?.ok && fingerprintConfirmed && !!targetAddress.trim() && !!registrationSecret.trim() && !creating;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <Card
                title="Outbound-Client hinzufügen"
                className="max-w-2xl w-full animate-fade-in my-8"
                action={
                    <button onClick={onClose} className="text-text-muted dark:text-text-muted-dark hover:text-text-primary transition-colors p-1 rounded-full">
                        <X size={20} />
                    </button>
                }
            >
                <div className="p-6 space-y-6">
                    <p className="text-sm text-text-muted dark:text-text-muted-dark">
                        Der Server wählt diesen Client aktiv an und stellt ihm den Weg zum PBS über einen
                        SSH-Reverse-Tunnel bereit. <strong>Die Verbindungsart ist danach nicht mehr änderbar.</strong>
                    </p>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">Client</h3>
                        <Input
                            label="Zieladresse (Host:Port des Agents)"
                            value={targetAddress}
                            onChange={(e) => setTargetAddress(e.target.value)}
                            placeholder="192.168.1.50:3001"
                        />
                        <Input
                            label="Registrierungs-Secret"
                            value={registrationSecret}
                            onChange={(e) => setRegistrationSecret(e.target.value)}
                            hint="Einmal-Secret aus der config.yaml des Agents"
                        />
                        <Input
                            label="Anzeigename (optional)"
                            value={hostname}
                            onChange={(e) => setHostname(e.target.value)}
                            placeholder="Wird sonst aus der Zieladresse abgeleitet"
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">SSH-Reverse-Tunnel</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <Input
                                    label="SSH-Host"
                                    value={sshHost}
                                    onChange={(e) => { setSshHost(e.target.value); invalidateTest(); }}
                                    placeholder="192.168.1.50"
                                />
                            </div>
                            <Input
                                label="Port"
                                value={sshPort}
                                onChange={(e) => { setSshPort(e.target.value); invalidateTest(); }}
                            />
                        </div>
                        <Input
                            label="SSH-Benutzer"
                            value={sshUser}
                            onChange={(e) => { setSshUser(e.target.value); invalidateTest(); }}
                            placeholder="pbcm"
                        />
                        <div>
                            <label className="block text-sm mb-1 text-text-primary dark:text-text-primary-dark">
                                Privater Schlüssel
                            </label>
                            <textarea
                                value={privateKey}
                                onChange={(e) => { setPrivateKey(e.target.value); invalidateTest(); }}
                                rows={5}
                                spellCheck={false}
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                className="w-full font-mono text-xs p-2 rounded border border-border dark:border-border-dark bg-card dark:bg-card-dark text-text-primary dark:text-text-primary-dark"
                            />
                        </div>
                        <Input
                            label="Passphrase (optional)"
                            type="password"
                            value={passphrase}
                            onChange={(e) => { setPassphrase(e.target.value); invalidateTest(); }}
                        />

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleTest}
                            disabled={!canTest}
                            isLoading={testing}
                            icon={<PlugZap size={16} />}
                        >
                            Verbindung testen
                        </Button>
                    </div>

                    {test?.ok && test.hostKeySha256 && (
                        <div className="rounded border border-border dark:border-border-dark p-4 space-y-3">
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-500 text-sm">
                                <ShieldCheck size={16} />
                                SSH-Verbindung und Reverse-Forward erfolgreich
                                {test.boundPort ? ` (Testport ${test.boundPort})` : ''}
                            </div>
                            <div>
                                <div className="text-xs text-text-muted dark:text-text-muted-dark mb-1">
                                    Host-Key-Fingerprint (SHA256)
                                </div>
                                <div className="font-mono text-xs break-all text-text-primary dark:text-text-primary-dark">
                                    {test.hostKeySha256}
                                </div>
                            </div>
                            <label className="flex items-start gap-2 text-sm text-text-primary dark:text-text-primary-dark">
                                <input
                                    type="checkbox"
                                    checked={fingerprintConfirmed}
                                    onChange={(e) => setFingerprintConfirmed(e.target.checked)}
                                    className="mt-1"
                                />
                                <span>
                                    Ich habe diesen Fingerprint geprüft. Er wird gepinnt; künftige Verbindungen
                                    werden strikt dagegen geprüft.
                                </span>
                            </label>
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-red-600 dark:text-red-400 break-words">{error}</div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={creating} icon={<X size={16} />}>
                            Abbrechen
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleCreate}
                            disabled={!canCreate}
                            isLoading={creating}
                            icon={<Plug size={16} />}
                        >
                            Client anlegen
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
