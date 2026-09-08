import { useCallback, useState, useEffect } from 'react';
import { X, Save, ShieldCheck, ShieldAlert, Send } from 'lucide-react';
import { ManagedRepository as Repository, normalizeFingerprint } from '@pbcm/shared';
import { Card, Button, ConfirmDialog, Input, ActionButton } from '@stefgo/react-ui-components';
import { useAuth } from '../../auth/AuthContext';
import { useRepositoryStore, CertificateCheck, DistributeResult } from '../../../stores/useRepositoryStore';

interface RepositoryEditorProps {
    repository?: Repository | null;
    /** Must reject on failure — the footer below is where the error is shown. */
    onSave: (repo: Partial<Repository>) => Promise<void>;
    onCancel: () => void;
}

/**
 * The same arrangement the client editor uses: leaving is the X in the card header, saving
 * is the one button under the fields it submits, and both report where they stand in the
 * footer instead of in a browser dialog. Unsaved work is asked about rather than dropped --
 * the way out sits a few pixels from the fields it would throw away.
 */
export const RepositoryEditor = ({ repository, onSave, onCancel }: RepositoryEditorProps) => {
    const [baseUrl, setBaseUrl] = useState('');
    const [datastore, setDatastore] = useState('');
    const [fingerprint, setFingerprint] = useState('');
    const [username, setUsername] = useState('');
    const [tokenName, setTokenName] = useState('');
    const [secret, setSecret] = useState('');

    const { token } = useAuth();
    const probeCertificate = useRepositoryStore((s) => s.probeCertificate);
    const distributeFingerprint = useRepositoryStore((s) => s.distributeFingerprint);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);

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
        setError(null);
        setSaved(false);
        // Keyed on the id, not the object: the store hands out a fresh object after every
        // save, and re-running this on that would wipe the "saved" note it just produced.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repository?.id]);

    // Compared against the stored repository, or against empty fields while creating one --
    // in both cases the question is the same: is there anything here worth keeping?
    const isDirty =
        baseUrl !== (repository?.baseUrl || '') ||
        datastore !== (repository?.datastore || '') ||
        fingerprint !== (repository?.fingerprint || '') ||
        username !== (repository?.username || '') ||
        tokenName !== (repository?.tokenname || '') ||
        secret !== (repository?.secret || '');

    // The required fields decide it here rather than an alert on submit: a button that
    // cannot do anything says so before it is pressed.
    const canSave =
        isDirty &&
        !!baseUrl.trim() &&
        !!datastore.trim() &&
        !!username.trim() &&
        !!secret.trim();

    /**
     * Leaving with unsaved fields asks first, the way the client editor does. The check
     * sits here and not in the callers so both surfaces that open this form -- the list
     * and the detail page -- behave the same.
     */
    const requestClose = useCallback(() => {
        if (isDirty) {
            setConfirmDiscard(true);
            return;
        }
        onCancel();
    }, [isDirty, onCancel]);

    // Escape does exactly what the header's button does -- including asking first.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // Not while a select, a dialog or an autocomplete is using Escape for itself --
            // this includes the discard dialog below, which closes on its own Escape.
            if (e.defaultPrevented) return;
            requestClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [requestClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setIsSaving(true);
        setError(null);
        setSaved(false);
        try {
            await onSave({
                baseUrl,
                datastore,
                fingerprint,
                username,
                tokenname: tokenName,
                secret
            });
            setSaved(true);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card
            className="flex flex-col"
            title={repository ? 'Edit Repository' : 'Add Repository'}
            action={
                <ActionButton icon={X} tooltip="Close" onClick={requestClose} />
            }
            classNames={{ headerTitle: "text-xl font-bold" }}
        >
            <form onSubmit={handleSubmit} className="flex flex-col">
                <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
                    <div className="space-y-4">
                        <Input
                            label="Base URL"
                            required
                            type="text"
                            placeholder="https://pbs.example.com:8007"
                            value={baseUrl}
                            onChange={(e) => { setBaseUrl(e.target.value); setSaved(false); }}
                            disabled={isSaving}
                        />
                        <Input
                            label="Datastore"
                            required
                            type="text"
                            placeholder="Datastore Name"
                            value={datastore}
                            onChange={(e) => { setDatastore(e.target.value); setSaved(false); }}
                            disabled={isSaving}
                        />
                        <div className="space-y-2">
                            <Input
                                label="Fingerprint"
                                type="text"
                                placeholder="Optional Fingerprint"
                                value={fingerprint}
                                onChange={(e) => { setFingerprint(e.target.value); setSaved(false); }}
                                disabled={isSaving}
                            />
                            {repository && (
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="secondary" onClick={handleCheckCertificate} disabled={isChecking}>
                                        {isChecking ? 'Checking...' : 'Check certificate'}
                                    </Button>
                                    <Button
                                        type="button"
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
                                                type="button"
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
                            onChange={(e) => { setUsername(e.target.value); setSaved(false); }}
                            disabled={isSaving}
                        />
                        <Input
                            label="Token Name"
                            type="text"
                            placeholder="mytoken (Optional)"
                            value={tokenName}
                            onChange={(e) => { setTokenName(e.target.value); setSaved(false); }}
                            disabled={isSaving}
                        />
                        <Input
                            label="Secret"
                            required
                            type="password"
                            placeholder="PBS Token Secret"
                            value={secret}
                            onChange={(e) => { setSecret(e.target.value); setSaved(false); }}
                            disabled={isSaving}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-4 border-t border-border px-6 py-5">
                    {error && <span className="text-sm text-error mr-auto">{error}</span>}
                    {!error && saved && <span className="text-sm text-success mr-auto">Repository saved</span>}
                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={isSaving}
                        disabled={!canSave}
                        icon={Save}
                        className="shadow-glow-accent"
                    >
                        {repository ? 'Update' : 'Save'} Repository
                    </Button>
                </div>
            </form>

            <ConfirmDialog
                isOpen={confirmDiscard}
                onClose={() => setConfirmDiscard(false)}
                onConfirm={onCancel}
                title="Discard your changes?"
                description="The repository has not been saved. Leaving now keeps it as it was."
                confirmLabel="Discard"
                cancelLabel="Keep editing"
                variant="danger"
            />
        </Card>
    );
};
