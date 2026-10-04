import { Badge } from '@stefgo/react-ui-components';
import { runStatusLabel, statusBadgeVariant } from '../lib/statusBadge';

/**
 * A run's status, wherever a run is shown: the history and a job's last run. The upper
 * case lives here, so the two cannot drift apart in how they write it.
 */
export const RunStatusBadge = ({ status, phase }: { status: string; phase?: string | null }) => (
    <Badge variant={statusBadgeVariant(status)} className="uppercase">
        {runStatusLabel(status, phase)}
    </Badge>
);
