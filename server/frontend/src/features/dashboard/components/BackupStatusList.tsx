import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Button, EmptyState } from '@stefgo/react-ui-components';
import { BaseHistoryList } from '../../history/components/BaseHistoryList';
import { QueryError } from '../../../components/QueryError';
import { ROUTES } from '../../../lib/paths';
import type { SessionHistoryItem } from '../../../lib/cacheUpdates';

interface BackupStatusListProps {
    /** The last run of every job, problems first (`byBackupStatus`). */
    runs: SessionHistoryItem[];
    error: Error | null;
}

/**
 * The last run of every job across all clients: what failed and has not run again since at
 * the top, and below it the backups that have gone longest without a new one. `JOB_UPDATE`
 * keeps the rows current, so a run moves as it starts and ends.
 */
export const BackupStatusList = ({ runs, error }: BackupStatusListProps) => {
    const navigate = useNavigate();

    if (error) return <QueryError title="Could not load the last runs" error={error} />;

    return (
        <BaseHistoryList
            title="Backup status"
            items={runs}
            showClientName
            action={
                <Button size="sm" variant="secondary" onClick={() => navigate(ROUTES.history)}>
                    All history
                </Button>
            }
            emptyMessage={
                <EmptyState
                    icon={Activity}
                    title="No job has run yet"
                    description="The last run of every job appears here."
                />
            }
        />
    );
};
