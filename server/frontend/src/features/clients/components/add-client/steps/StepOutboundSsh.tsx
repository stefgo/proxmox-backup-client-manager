import { ShieldCheck } from 'lucide-react';
import { Input } from '@stefgo/react-ui-components';
import { SshKeyFields, SshKeyMode } from '../../SshKeyFields';
import { SshHostSetupSnippet } from '../../SshHostSetupSnippet';
import { OutboundForm } from '../useAddClientForm';

interface StepOutboundSshProps {
    token: string | null;
    form: OutboundForm;
    onPatch: (patch: Partial<OutboundForm>) => void;
    /** A failed "Test & Create" — the wizard runs it, so it reports back here. */
    error?: string | null;
}

/**
 * The SSH credentials the server uses to open the reverse tunnel — and the last
 * step of the outbound flow: "Test & Create" tests from here and creates the
 * client if the tunnel stands.
 *
 * The host setup snippet sits below the key on purpose: the `authorized_keys`
 * entry has to exist on the client host before that test can succeed, and this
 * is the last screen on which it can still be fixed.
 */
export const StepOutboundSsh = ({ token, form, onPatch, error }: StepOutboundSshProps) => (
    <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
                <Input
                    label="SSH Host"
                    required
                    value={form.sshHost}
                    onChange={(e) => onPatch({ sshHost: e.target.value })}
                    placeholder="192.168.1.50"
                />
            </div>
            <Input
                label="Port"
                value={form.sshPort}
                onChange={(e) => onPatch({ sshPort: e.target.value })}
            />
        </div>

        <Input
            label="SSH User"
            required
            value={form.sshUser}
            onChange={(e) => onPatch({ sshUser: e.target.value })}
            placeholder="pbcm"
        />

        <SshKeyFields
            token={token}
            mode={form.keyMode}
            onModeChange={(mode: SshKeyMode) =>
                onPatch({ keyMode: mode, privateKey: '', passphrase: '' })
            }
            privateKey={form.privateKey}
            onPrivateKeyChange={(privateKey) => onPatch({ privateKey })}
            passphrase={form.passphrase}
            onPassphraseChange={(passphrase) => onPatch({ passphrase })}
        />

        <SshHostSetupSnippet
            token={token}
            privateKey={form.privateKey}
            passphrase={form.passphrase}
            sshUser={form.sshUser}
        />

        {/* Only ever on screen after a failure: a run that gets through both
            halves closes the wizard. A tunnel that stood while the creation
            itself failed still shows what was tested. */}
        {form.test?.ok && form.test.hostKeySha256 && (
            <div className="rounded border border-border p-4 space-y-2">
                <div className="flex items-center gap-2 text-success text-sm">
                    <ShieldCheck size={16} aria-hidden />
                    SSH connection and reverse forward succeeded
                    {form.test.boundPort ? ` (test port ${form.test.boundPort})` : ''}
                </div>
                <div>
                    <div className="text-xs text-text-muted mb-1">Host Key Fingerprint (SHA256)</div>
                    <div className="font-mono text-xs break-all text-text-primary">
                        {form.test.hostKeySha256}
                    </div>
                </div>
            </div>
        )}

        {error && <div className="text-sm text-error break-words">{error}</div>}
    </div>
);
