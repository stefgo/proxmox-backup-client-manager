import { useState } from 'react';
import { X, Save, ShieldCheck, ShieldAlert, Send } from 'lucide-react';
import {
    RepositoryInputSchema,
    normalizeFingerprint,
    type CertificateCheck,
    type DistributeResult,
    type ManagedRepository as Repository,
    type RepositoryInput,
} from '@pbcm/shared';
import { Card, Button, Input, ActionButton, useConfirm } from '@stefgo/react-ui-components';
import { describeDistribute } from '../confirmations';
import { distributeRepository, probeCertificate } from '../../../queries/repositories';
import { useEntityForm } from '../../../hooks/useEntityForm';
import { useUnsavedChangesGuard } from '../../../hooks/useUnsavedChangesGuard';
import { getErrorMessage } from '../../../utils';
import {
    repositoryDraftFrom,
    repositoryFieldOf,
    repositoryInputFrom,
    repositoryRules,
    storedRepositoryDraft,
    type RepositoryDraft,
} from '../lib/repositoryForm';
import { HeaderBreadcrumb } from '../../app/HeaderBreadcrumb';

interface RepositoryEditorProps {
    /** The repository to edit. Absent for a new one. The route keys the editor by its id. */
    repository?: Repository | null;
    /** Must reject on failure — the footer below is where the error is shown. */
    onSave: (repo: RepositoryInput) => Promise<unknown>;
}

/**
 * Asks the PBS for the certificate it serves and compares it with the stored fingerprint.
 * Asked on request and shown where it was asked; the answer is no part of the form, only
 * the fingerprint it offers to adopt is.
 */
const CertificateCheckPanel = ({
    repository,
    onAdopt,
}: {
    repository: Repository;
    onAdopt: (fingerprint: string) => void;
}) => {
    const [check, setCheck] = useState<CertificateCheck | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);

    const handleCheckCertificate = async () => {
        setIsChecking(true);
        setCheckError(null);
        try {
            setCheck(await probeCertificate(repository.id));
        } catch (e) {
            setCheck(null);
            setCheckError(getErrorMessage(e));
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={handleCheckCertificate} disabled={isChecking}>
                    {isChecking ? 'Checking...' : 'Check certificate'}
                </Button>
            </div>

            {repository.observed && (
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
                                onClick={() => onAdopt(check.measuredFingerprint || '')}
                                disabled={!check.measuredFingerprint}
                            >
                                Adopt measured fingerprint
                            </Button>
                        </>
                    )}
                </div>
            )}
        </>
    );
};

/**
 * Pushes the stored fingerprint and secret to the jobs on connected clients, which keep
 * their own copy of both.
 *
 * Distribution always rolls out the *saved* values. Offering it while a field differs
 * would push something other than what is on screen, so the editor switches it off then.
 */
const DistributePanel = ({ repository, unsaved }: { repository: Repository; unsaved: boolean }) => {
    const { confirm } = useConfirm();
    const [distribution, setDistribution] = useState<DistributeResult | null>(null);
    const [isDistributing, setIsDistributing] = useState(false);
    const [distributeError, setDistributeError] = useState<string | null>(null);

    const handleDistribute = async () => {
        if (!(await confirm(describeDistribute()))) return;
        setIsDistributing(true);
        setDistribution(null);
        setDistributeError(null);
        try {
            setDistribution(await distributeRepository(repository.id));
        } catch (e) {
            setDistributeError(getErrorMessage(e));
        } finally {
            setIsDistributing(false);
        }
    };

    return (
        <div className="space-y-2">
            <Button
                type="button"
                variant="secondary"
                onClick={handleDistribute}
                disabled={isDistributing || unsaved}
                title={
                    unsaved
                        ? 'Save the repository first — distribution rolls out the stored values.'
                        : 'Push the stored fingerprint and secret to the jobs on all connected clients'
                }
            >
                <Send size={14} className="mr-1 inline" />
                {isDistributing ? 'Distributing...' : 'Distribute to clients'}
            </Button>

            {distributeError && (
                <div className="text-sm text-error break-words">{distributeError}</div>
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
    );
};

/**
 * The same arrangement the client editor uses: leaving is the X in the card header, saving
 * is the one button under the fields it submits, and both report where they stand in the
 * footer instead of in a browser dialog. Unsaved work is asked about on every way out.
 *
 * A new repository leaves once it is saved -- a form that has produced its repository would
 * only produce a second one. Editing stays and says "Repository saved"; the operator
 * decides when to leave.
 */
export const RepositoryEditor = ({ repository, onSave }: RepositoryEditorProps) => {
    const isNew = !repository;
    const form = useEntityForm({
        schema: RepositoryInputSchema,
        initial: () => repositoryDraftFrom(repository),
        toInput: repositoryInputFrom,
        fieldOf: repositoryFieldOf,
        rules: (draft: RepositoryDraft) => repositoryRules(draft, isNew),
    });
    const { draft, set, errors, isSaving } = form;
    const { close, leave } = useUnsavedChangesGuard(form.isDirty, 'repository');

    // For the secret, anything typed in is unsaved by definition.
    const credentialsDifferFromSaved =
        normalizeFingerprint(draft.fingerprint) !== normalizeFingerprint(repository?.fingerprint) ||
        draft.secret !== '';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const stored = await form.submit(onSave, { rebase: storedRepositoryDraft });
        if (stored && isNew) leave();
    };

    const footerError = form.saveError ?? form.formError;

    return (
        <Card
            className="flex flex-col"
            title={
                repository
                    ? <HeaderBreadcrumb>Edit Repository</HeaderBreadcrumb>
                    : <HeaderBreadcrumb current="Add Repository">Add Repository</HeaderBreadcrumb>
            }
            action={
                <ActionButton icon={X} tooltip="Close" onClick={close} />
            }
        >
            <form onSubmit={handleSubmit} className="flex flex-col">
                <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
                    <div className="space-y-4">
                        <Input
                            label="Base URL"
                            required
                            type="text"
                            placeholder="https://pbs.example.com:8007"
                            value={draft.baseUrl}
                            onChange={(e) => set('baseUrl', e.target.value)}
                            error={errors.baseUrl}
                            disabled={isSaving}
                        />
                        <Input
                            label="Datastore"
                            required
                            type="text"
                            placeholder="Datastore Name"
                            value={draft.datastore}
                            onChange={(e) => set('datastore', e.target.value)}
                            error={errors.datastore}
                            disabled={isSaving}
                        />
                        <div className="space-y-2">
                            <Input
                                label="Fingerprint"
                                type="text"
                                placeholder="Optional Fingerprint"
                                value={draft.fingerprint}
                                onChange={(e) => set('fingerprint', e.target.value)}
                                error={errors.fingerprint}
                                disabled={isSaving}
                            />
                            {repository && (
                                <CertificateCheckPanel
                                    repository={repository}
                                    onAdopt={(fingerprint) => set('fingerprint', fingerprint)}
                                />
                            )}
                        </div>
                        <Input
                            label="Username"
                            required
                            type="text"
                            placeholder="root@pam"
                            value={draft.username}
                            onChange={(e) => set('username', e.target.value)}
                            error={errors.username}
                            disabled={isSaving}
                        />
                        <Input
                            label="Token Name"
                            type="text"
                            placeholder="mytoken (Optional)"
                            value={draft.tokenName}
                            onChange={(e) => set('tokenName', e.target.value)}
                            error={errors.tokenName}
                            disabled={isSaving}
                        />
                        <Input
                            label="Secret"
                            required={!repository}
                            type="password"
                            placeholder={repository ? 'Unchanged — leave empty to keep it' : 'PBS Token Secret'}
                            autoComplete="new-password"
                            value={draft.secret}
                            onChange={(e) => set('secret', e.target.value)}
                            error={errors.secret}
                            disabled={isSaving}
                        />

                        {/* Below the fields it rolls out: jobs keep their own copy of the
                            fingerprint and the secret, and this pushes both. */}
                        {repository && (
                            <DistributePanel repository={repository} unsaved={credentialsDifferFromSaved} />
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-4 border-t border-border px-6 py-5">
                    {footerError && <span className="text-sm text-error mr-auto">{footerError}</span>}
                    {!footerError && form.saved && <span className="text-sm text-success mr-auto">Repository saved</span>}
                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={isSaving}
                        disabled={!form.canSave}
                        icon={Save}
                        className="shadow-glow-accent"
                    >
                        {repository ? 'Update' : 'Save'} Repository
                    </Button>
                </div>
            </form>

        </Card>
    );
};
