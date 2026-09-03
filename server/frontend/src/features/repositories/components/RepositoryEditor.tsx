import { useState, useEffect } from 'react';
import { X, ShieldCheck, ShieldAlert, Send } from 'lucide-react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { Card, Button, Input, ActionButton } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { useRepositoryStore, CertificateCheck, DistributeResult } from '../../../stores/useRepositoryStore';

const normalizeFingerprint = (value?: string | null) => (value ?? '').replace(/\s+/g, '').toLowerCase();

interface RepositoryEditorProps {
    repository?: Repository | null;
    onSave: (repo: Partial<Repository>) => Promise<void>;
    onCancel: () => void;
    isSaving?: boolean;
}

export const RepositoryEditor = ({ repository, onSave, onCancel, isSaving = false }: RepositoryEditorProps) => {
    const [baseUrl, setBaseUrl] = useState('');
    const [datastore, setDatastore] = useState('');
    const [fingerprint, setFingerprint] = useState('');
    const [username, setUsername] = useState('');
    const [tokenName, setTokenName] = useState('');
    const [secret, setSecret] = useState('');

    const { token } = useAuth();
    const probeCertificate = useRepositoryStore((s) => s.probeCertificate);
    const distributeFingerprint = useRepositoryStore((s) => s.distributeFingerprint);

    const [check, setCheck] = useState<CertificateCheck | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [distribution, setDistribution] = useState<DistributeResult | null>(null);
    const [isDistributing, setIsDistributing] = useState(false);

    // Distribution always rolls out the *saved* value. Offering it while the field
    // differs would push something other than what is on screen.
    const fingerprintDiffersFromSaved =
        normalizeFingerprint(fingerprint) !== normalizeFingerprint(repository?.fingerprint);

    const handleCheckCertificate = async () => {
        if (!repository || !token) return;
        setIsChecking(true);
        setCheckError(null);
        setDistribution(null);
        try {
            setCheck(await probeCertificate(repository.id));
        } catch (e) {
            setCheck(null);
            setCheckError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsChecking(false);
        }
    };

    const handleDistribute = async () => {
        if (!repository || !token) return;
        if (!confirm('Push the saved fingerprint to all connected clients?')) return;
        setIsDistributing(true);
        try {
            setDistribution(await distributeFingerprint(repository.id));
        } catch (e) {
            setCheckError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsDistributing(false);
        }
    };

    useEffect(() => {
        if (repository) {
            setBaseUrl(repository.baseUrl);
            setDatastore(repository.datastore);
            setFingerprint(repository.fingerprint || '');
            setUsername(repository.username);
            setTokenName(repository.tokenname || '');
            setSecret(repository.secret);
        } else {
            setBaseUrl('');
            setDatastore('');
            setFingerprint('');
            setUsername('');
            setTokenName('');
            setSecret('');
        }
        setCheck(null);
        setCheckError(null);
        setDistribution(null);
    }, [repository]);

    const handleSubmit = async () => {
        if (!baseUrl || !datastore || !username || !secret) {
            alert('Please fill in all required fields');
            return;
        }

        await onSave({
            baseUrl,
            datastore,
            fingerprint,
            username,
            tokenname: tokenName,
            secret
        });
    };

    return (
        <Card
            className="flex flex-col"
            title={repository ? 'Edit Repository' : 'Add Repository'}
            action={
                <ActionButton icon={X} tooltip="Close" onClick={onCancel} />
            }
            classNames={{ headerTitle: "text-xl font-bold" }}
        >
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
                <div className="space-y-4">
                    <Input
                        label="Base URL"
                        required
                        type="text"
                        placeholder="https://pbs.example.com:8007"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                    />
                    <Input
                        label="Datastore"
                        required
                        type="text"
                        placeholder="Datastore Name"
                        value={datastore}
                        onChange={(e) => setDatastore(e.target.value)}
                    />
                    <div className="space-y-2">
                        <Input
                            label="Fingerprint"
                            type="text"
                            placeholder="Optional Fingerprint"
                            value={fingerprint}
                            onChange={(e) => setFingerprint(e.target.value)}
                        />
                        {repository && (
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={handleCheckCertificate} disabled={isChecking}>
                                    {isChecking ? 'Checking...' : 'Check certificate'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={handleDistribute}
                                    disabled={isDistributing || fingerprintDiffersFromSaved}
                                    title={
                                        fingerprintDiffersFromSaved
                                            ? 'Save the repository first — distribution rolls out the stored value.'
                                            : undefined
                                    }
                                >
                                    <Send size={14} className="mr-1 inline" />
                                    {isDistributing ? 'Distributing...' : 'Distribute to clients'}
                                </Button>
                            </div>
                        )}

                        {repository?.observed && (
                            <div className="text-xs text-text-muted break-all">
                                Last reported by a client: <span className="font-mono">{repository.observed.fingerprint}</span>
                                {repository.observed.caValid ? ' (CA-validated)' : ' (not CA-validated)'}
                            </div>
                        )}

                        {checkError && (
                            <div className="text-sm text-error break-words">{checkError}</div>
                        )}

                        {check && (
                            <div className="rounded border border-border p-4 space-y-3 text-sm">
                                {!check.reachable && (
                                    <div className="text-text-muted">
                                        PBS not reachable — the stored fingerprint was left untouched.
                                        {check.error ? ` (${check.error})` : ''}
                                    </div>
                                )}

                                {check.reachable && check.matches && (
                                    <div className="flex items-center gap-2 text-success">
                                        <ShieldCheck size={16} />
                                        Fingerprint is up to date
                                        {check.notAfter ? ` — certificate valid until ${check.notAfter}` : ''}
                                    </div>
                                )}

                                {check.reachable && !check.matches && (
                                    <>
                                        <div className="flex items-center gap-2 text-warning">
                                            <ShieldAlert size={16} />
                                            The served certificate differs from the stored fingerprint
                                        </div>
                                        <div>
                                            <div className="text-xs text-text-muted mb-1">
                                                Measured (SHA256)
                                            </div>
                                            <div className="font-mono text-xs break-all text-text-primary">
                                                {check.measuredFingerprint}
                                            </div>
                                        </div>
                                        {check.caValid ? (
                                            <div className="text-xs text-text-muted">
                                                The certificate passed regular CA validation for this hostname, so it is
                                                genuine — most likely a renewal.
                                            </div>
                                        ) : (
                                            <div className="text-xs text-warning">
                                                CA validation failed, so this certificate could not be confirmed as
                                                genuine. Verify it out of band first
                                                (<span className="font-mono">proxmox-backup-manager cert info</span>)
                                                before adopting it.
                                            </div>
                                        )}
                                        <Button
                                            variant="secondary"
                                            onClick={() => setFingerprint(check.measuredFingerprint || '')}
                                            disabled={!check.measuredFingerprint}
                                        >
                                            Adopt measured fingerprint
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}

                        {distribution && (
                            <div className="rounded border border-border p-4 space-y-1 text-xs">
                                <div className="text-text-primary">
                                    {distribution.updated.length} job(s) updated
                                    {distribution.failed.length > 0 ? `, ${distribution.failed.length} failed` : ''}
                                </div>
                                {distribution.skippedOffline.length > 0 && (
                                    <div className="text-text-muted">
                                        Skipped (offline): {distribution.skippedOffline.map((c) => c.hostname).join(', ')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <Input
                        label="Username"
                        required
                        type="text"
                        placeholder="root@pam"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <Input
                        label="Token Name"
                        type="text"
                        placeholder="mytoken (Optional)"
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                    />
                    <Input
                        label="Secret"
                        required
                        type="password"
                        placeholder="PBS Token Secret"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="shadow-glow-accent"
                >
                    {repository ? 'Update' : 'Save'} Repository
                </Button>
            </div>
        </Card>
    );
};
