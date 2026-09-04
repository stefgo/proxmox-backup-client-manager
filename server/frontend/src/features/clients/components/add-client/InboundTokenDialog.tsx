import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { ActionButton, Button, Modal, cn, FOCUS_RING } from '@stefgo/react-ui-components';
import { formatDate } from '../../../../utils';
import { InboundForm } from './useAddClientForm';

interface InboundTokenDialogProps {
    form: InboundForm;
    /** Acknowledges the token and leaves the wizard. */
    onClose: () => void;
}

const COPY_FEEDBACK_MS = 2000;

/**
 * Shows the registration token the wizard just issued.
 *
 * A dialog rather than a wizard step, because this is no longer part of the
 * form: the token exists on the server from the moment it appears here, so
 * there is nothing left to go back to or to revise. It is also the only time
 * the token is ever shown in full — the token list stores it hashed — which is
 * why the backdrop does not dismiss it and the only way out is the button.
 */
export const InboundTokenDialog = ({ form, onClose }: InboundTokenDialogProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(form.token);
        setCopied(true);
        setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Registration Token"
            description="Hand this token to the agent — it is shown only once."
            size="md"
            closeOnOverlayClick={false}
            footer={
                <div className="flex justify-end">
                    <Button variant="primary" onClick={onClose}>Done</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        readOnly
                        value={form.token}
                        aria-label="Registration token"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className={cn(
                            'flex-1 bg-app-bg p-3 rounded-lg border border-border font-mono text-sm text-primary',
                            FOCUS_RING,
                        )}
                    />
                    <ActionButton
                        icon={copied ? Check : Copy}
                        size="lg"
                        variant="solid"
                        color={copied ? 'green' : 'gray'}
                        tooltip={copied ? 'Copied!' : 'Copy to clipboard'}
                        onClick={handleCopy}
                        className={copied ? 'text-success' : undefined}
                    />
                </div>

                <p className="text-xs text-text-muted">Expires: {formatDate(form.expiresAt)}</p>

                <ol className="space-y-2 text-sm text-text-secondary list-decimal pl-5">
                    <li>
                        Open the agent's web interface at{' '}
                        <span className="font-mono text-text-primary">http://&lt;client&gt;:3001</span>.
                    </li>
                    <li>Paste the token there and register. The client then appears in the list.</li>
                </ol>

                {(form.displayName.trim() || form.allowedIp.trim()) && (
                    <p className="text-xs text-text-muted">
                        The token carries
                        {form.displayName.trim() && (
                            <> the name <span className="text-text-primary">{form.displayName.trim()}</span></>
                        )}
                        {form.displayName.trim() && form.allowedIp.trim() && ' and'}
                        {form.allowedIp.trim() && (
                            <> the network <span className="font-mono text-text-primary">{form.allowedIp.trim()}</span></>
                        )}
                        {' '}— it can only be redeemed from there.
                    </p>
                )}
            </div>
        </Modal>
    );
};
