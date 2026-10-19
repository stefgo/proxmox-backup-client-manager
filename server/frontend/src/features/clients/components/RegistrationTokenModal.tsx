import { Button, CopyField, Modal } from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';

interface RegistrationTokenModalProps {
    token: string;
    expiresAt: string;
    /** Acknowledges the token. */
    onClose: () => void;
}

/**
 * A client's registration token, shown the one time it exists in the clear, and what to do
 * with it.
 *
 * The server keeps only its hash, which is why neither the backdrop nor Escape dismisses
 * it and the only way out is the button.
 */
export const RegistrationTokenModal = ({ token, expiresAt, onClose }: RegistrationTokenModalProps) => (
    <Modal
        isOpen
        onClose={onClose}
        title="Registration Token"
        description="Hand this token to the agent — it is shown only once."
        size="md"
        closeOnOverlayClick={false}
        closeOnEscape={false}
        footer={
            <div className="flex justify-end">
                <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
        }
    >
        <div className="space-y-4">
            {/* The clipboard API exists in a secure context only, and the dashboard is often
                reached over plain HTTP in a LAN. There the field selects the token instead,
                one keystroke from copied, and says so. */}
            <CopyField
                value={token}
                aria-label="Registration token"
                labels={{
                    unavailable:
                        'Copying is not available on this connection — the token is selected, press Ctrl/⌘+C.',
                }}
            />

            <p className="text-xs text-text-muted">Registers one agent, until {formatDate(expiresAt)}.</p>

            <ol className="space-y-2 text-sm text-text-secondary list-decimal pl-5">
                <li>
                    Open the agent's web interface at{' '}
                    <span className="font-mono text-text-primary">http://&lt;client&gt;:3001</span>.
                </li>
                <li>Paste the token there and register. The agent then connects under this client.</li>
            </ol>
        </div>
    </Modal>
);
