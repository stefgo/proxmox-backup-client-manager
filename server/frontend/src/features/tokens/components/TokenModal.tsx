import { Card, Button, CopyField } from '@stefgo/react-ui-components';
import { formatDate } from '../../../utils';

interface TokenModalProps {
    token: string;
    expiresAt: string;
    onClose: () => void;
}

export const TokenModal = ({ token, expiresAt, onClose }: TokenModalProps) => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <Card title="New Registration Token" className="max-w-lg w-full animate-fade-in" padding="md" classNames={{ content: 'space-y-4' }}>
            {/* Over plain HTTP there is no clipboard; the field then selects the token instead. */}
            <CopyField value={token} aria-label="Registration token" />

            <div className="text-xs text-text-muted">Expires: {formatDate(expiresAt)}</div>

            <Button variant="primary" onClick={onClose} className="w-full">Close</Button>
        </Card>
    </div>
);
