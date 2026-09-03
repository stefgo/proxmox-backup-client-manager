import { useState } from 'react';
import { Plug, X, ShieldCheck, PlugZap } from 'lucide-react';
import { Card, Button, Input, ActionButton, Checkbox } from '@stefgo/react-ui-components';
import { SshKeyFields, SshKeyMode } from './SshKeyFields';
import { SshHostSetupSnippet } from './SshHostSetupSnippet';
import { apiFetch } from '../../../lib/apiFetch';

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
    const [keyMode, setKeyMode] = useState<SshKeyMode>('generate');
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
            const res = await apiFetch('/api/v1/tunnel/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            if (!data.ok) setError(data.error || 'Tunnel test failed');
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
            const res = await apiFetch('/api/v1/clients/outbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            if (!res.ok) throw new Error(data.error || 'Failed to create client');
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <Card
                title="Add Outbound Client"
                className="max-w-2xl w-full max-h-[calc(100vh-2rem)] flex flex-col animate-fade-in"
                classNames={{ header: 'shrink-0' }}
                action={
                    <ActionButton icon={X} tooltip="Close" onClick={onClose} />
                }
            >
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                    <p className="text-sm text-text-muted">
                        The server dials this client and gives it a route to the PBS through an SSH
                        reverse tunnel. <strong>The connection mode cannot be changed afterwards.</strong>
                    </p>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-text-primary">Client</h3>
                        <Input
                            label="Target Address (host:port of the agent)"
                            value={targetAddress}
                            onChange={(e) => setTargetAddress(e.target.value)}
                            placeholder="192.168.1.50:3001"
                        />
                        <Input
                            label="Registration Secret"
                            value={registrationSecret}
                            onChange={(e) => setRegistrationSecret(e.target.value)}
                            hint="One-time secret from the agent's config.yaml"
                        />
                        <Input
                            label="Display Name (optional)"
                            value={hostname}
                            onChange={(e) => setHostname(e.target.value)}
                            placeholder="Derived from the target address if left empty"
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-text-primary">SSH Reverse Tunnel</h3>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <Input
                                    label="SSH Host"
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
                            label="SSH User"
                            value={sshUser}
                            onChange={(e) => { setSshUser(e.target.value); invalidateTest(); }}
                            placeholder="pbcm"
                        />
                        <SshKeyFields
                            token={token}
                            mode={keyMode}
                            onModeChange={(m) => {
                                setKeyMode(m);
                                setPrivateKey('');
                                setPassphrase('');
                                invalidateTest();
                            }}
                            privateKey={privateKey}
                            onPrivateKeyChange={(v) => { setPrivateKey(v); invalidateTest(); }}
                            passphrase={passphrase}
                            onPassphraseChange={(v) => { setPassphrase(v); invalidateTest(); }}
                        />

                        <SshHostSetupSnippet
                            token={token}
                            privateKey={privateKey}
                            passphrase={passphrase}
                            sshUser={sshUser}
                        />

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleTest}
                            disabled={!canTest}
                            isLoading={testing}
                            icon={PlugZap}
                        >
                            Test Connection
                        </Button>
                    </div>

                    {test?.ok && test.hostKeySha256 && (
                        <div className="rounded border border-border p-4 space-y-3">
                            <div className="flex items-center gap-2 text-success text-sm">
                                <ShieldCheck size={16} />
                                SSH connection and reverse forward succeeded
                                {test.boundPort ? ` (test port ${test.boundPort})` : ''}
                            </div>
                            <div>
                                <div className="text-xs text-text-muted mb-1">
                                    Host Key Fingerprint (SHA256)
                                </div>
                                <div className="font-mono text-xs break-all text-text-primary">
                                    {test.hostKeySha256}
                                </div>
                            </div>
                            <Checkbox
                                checked={fingerprintConfirmed}
                                onChange={(e) => setFingerprintConfirmed(e.target.checked)}
                                label="I have verified this fingerprint. It will be pinned, and future connections are checked strictly against it."
                                classNames={{ control: 'items-start pt-1' }}
                            />
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-error break-words">{error}</div>
                    )}
                </div>

                <div className="shrink-0 flex justify-end gap-3 border-t border-border px-6 py-4">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={creating} icon={X}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        onClick={handleCreate}
                        disabled={!canCreate}
                        isLoading={creating}
                        icon={Plug}
                    >
                        Create Client
                    </Button>
                </div>
            </Card>
        </div>
    );
};
