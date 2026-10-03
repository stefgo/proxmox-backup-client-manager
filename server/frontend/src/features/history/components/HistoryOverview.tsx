import { useEffect, useMemo } from 'react';
import { JOB_STATUS } from '@pbcm/shared';
import { Switch, LoadingIndicator } from '@stefgo/react-ui-components';
import { BaseHistoryList, BaseHistoryItem } from './BaseHistoryList';
import { ApiError } from '../../../lib/api';
import { markHistorySeen, useGlobalHistory } from '../../../queries/history';
import { useSearchQueryParam } from '../../../hooks/useSearchQueryParam';
import { PAGE_SIZE } from '../../../components/listDefaults';

const NO_HISTORY: BaseHistoryItem[] = [];

export const HistoryOverview = () => {
    // Read again after a reconnect like everything else in the cache: runs that ended
    // while the socket was down never arrived.
    const { data: history = NO_HISTORY, isPending, error } = useGlobalHistory();
    // In the URL, so a link from the failure dot or a colleague lands on the same view.
    const [status, setStatus] = useSearchQueryParam('status');
    const failedOnly = status === JOB_STATUS.FAILED;
    const visible = useMemo(
        () => (failedOnly ? history.filter((h) => h.status === JOB_STATUS.FAILED) : history),
        [history, failedOnly],
    );

    // Seen on the way in and again on the way out: a failure that arrives while the page
    // is open appears in it, so it has been seen as well.
    useEffect(() => {
        markHistorySeen();
        return () => {
            markHistorySeen();
        };
    }, []);

    if (isPending) {
        return <LoadingIndicator label="Loading history…" />;
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-error-bg text-error p-4 rounded-md">
                    {/* A refusal is the server's answer; anything else never got one. */}
                    {error instanceof ApiError ? 'Failed to fetch history' : 'An error occurred while fetching history'}
                </div>
            </div>
        );
    }

    return (
        <BaseHistoryList
            items={visible}
            showClientName={true}
            pageSize={PAGE_SIZE.page}
            emptyMessage={failedOnly ? 'No failed runs' : undefined}
            action={
                <Switch
                    label="Failures only"
                    value={failedOnly}
                    onChange={(on) => setStatus(on ? JOB_STATUS.FAILED : '')}
                />
            }
        />
    );
};
