import { useEffect, useState } from 'react';
import { PlugZap, Save } from 'lucide-react';
import { Button, Input } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';

interface ClientTunnelSettingsProps {
    clientId: string;
}

interface TunnelInfo {
    sshHost: string;
    sshPort: number;
    sshUser: string;
    hostKeySha256: string;
    remoteBindHost: string;
    state?: {
        status: string;
        activeLeases: number;
        forwards: { target: string; port: number }[];
        lastUsedAt?: string | null;
        lastError?: string | null;
    };
}

/**
 * SSH credentials of an outbound client. Deliberately limited: connection mode, tunnel
 * target and bind port are not editable — the mode is fixed at creation, the target
 * follows from each job's repository, and the port is allocated per forward.
 */
export const ClientTunnelSettings = ({ clientId }: ClientTunnelSettingsProps) => {
    const { token } = useAuth();
    const [info, setInfo] = useState<TunnelInfo | null>(null);
    const [sshHost, setSshHost] = useState('');
    const [sshPort, setSshPort] = useState('22');
    const [sshUser, setSshUser] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/v1/clients/${clientId}/tunnel`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data: TunnelInfo = await res.json();
                setInfo(data);
                setSshHost(data.sshHost);
                setSshPort(String(data.sshPort));
                setSshUser(data.sshUser);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        };
        load();
    }, [clientId, token]);

    const handleTest = async () => {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/tunnel/test`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.ok) {
                setMessage(`Verbindung erfolgreich (Testport ${data.boundPort})`);
            } else {
                setError(data.error || 'Tunneltest fehlgeschlagen');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const handleSave = async () => {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const body: Record<string, unknown> = {
                sshHost,
                sshPort: Number(sshPort) || 22,
                sshUser,
            };
            if (privateKey.trim()) body.privateKey = privateKey.trim();
            if (passphrase) body.passphrase = passphrase;

            const res = await fetch(`/api/v1/clients/${clientId}/tunnel`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
            setMessage('SSH-Zugangsdaten gespeichert');
            setPrivateKey('');
            setPassphrase('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (!info) return null;

    return (
        <div className="space-y-4 border-t border-border dark:border-border-dark pt-6">
            <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary-dark">
                SSH-Reverse-Tunnel
            </h3>

            <div className="text-xs text-text-muted dark:text-text-muted-dark space-y-1">
                <div>
                    Status: <span className="font-mono">{info.state?.status ?? 'idle'}</span>
                    {!!info.state?.activeLeases && ` · ${info.state.activeLeases} aktive Lease(s)`}
                </div>
                {info.state?.forwards?.map((f) => (
                    <div key={f.target} className="font-mono">
                        {f.target} → {info.remoteBindHost}:{f.port}
                    </div>
                ))}
                {info.state?.lastError && (
                    <div className="text-red-600 dark:text-red-400">{info.state.lastError}</div>
                )}
                <div className="font-mono break-all">Host-Key: {info.hostKeySha256}</div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <Input label="SSH-Host" value={sshHost} onChange={(e) => setSshHost(e.target.value)} />
                </div>
                <Input label="Port" value={sshPort} onChange={(e) => setSshPort(e.target.value)} />
            </div>
            <Input label="SSH-Benutzer" value={sshUser} onChange={(e) => setSshUser(e.target.value)} />
            <div>
                <label className="block text-sm mb-1 text-text-primary dark:text-text-primary-dark">
                    Privater Schlüssel ersetzen (optional)
                </label>
                <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    rows={4}
                    spellCheck={false}
                    placeholder="Leer lassen, um den hinterlegten Schlüssel zu behalten"
                    className="w-full font-mono text-xs p-2 rounded border border-border dark:border-border-dark bg-card dark:bg-card-dark text-text-primary dark:text-text-primary-dark"
                />
            </div>
            <Input
                label="Passphrase (optional)"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
            />

            {message && <div className="text-sm text-green-600 dark:text-green-500">{message}</div>}
            {error && <div className="text-sm text-red-600 dark:text-red-400 break-words">{error}</div>}

            <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={handleTest} disabled={busy} icon={<PlugZap size={16} />}>
                    Verbindung testen
                </Button>
                <Button type="button" variant="secondary" onClick={handleSave} disabled={busy} icon={<Save size={16} />}>
                    Zugangsdaten speichern
                </Button>
            </div>
        </div>
    );
};
