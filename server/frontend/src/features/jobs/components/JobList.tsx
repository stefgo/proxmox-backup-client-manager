import { Unplug } from 'lucide-react';
import { ClientStatus } from '@pbcm/shared';
import { EmptyState } from '@stefgo/react-ui-components';
import type { GlobalJob } from '../../../lib/cacheUpdates';
import { BaseJobList } from './BaseJobList';
import type { LastRun } from '../lib/lastRun';
import type { JobListEmpty } from '../lib/jobListEmpty';
import { PAGE_SIZE } from '../../../components/listDefaults';

interface JobListProps {
    jobs: GlobalJob[];
    onEditJob: (job: GlobalJob) => void;
    onCreateJob: () => void;
    onTriggerJob: (job: GlobalJob) => void;
    onDeleteJob: (job: GlobalJob) => void;
    getClientStatus: (clientId: string) => ClientStatus;
    getClientName: (clientId: string) => string;
    getLastRun: (job: GlobalJob) => LastRun | undefined;
    /** Why the list is empty, when it is -- see `jobListEmpty`. */
    empty: JobListEmpty;
}

/**
 * What an empty list says. "No jobs configured yet" only where that is known: the jobs
 * of a client that is not connected are on its agent, not missing.
 */
const emptyMessage = (empty: JobListEmpty) => {
    switch (empty.kind) {
        case 'none':
            return undefined;
        case 'allOffline':
            return (
                <EmptyState
                    icon={Unplug}
                    title="No client is online"
                    description="Jobs are stored on the agents. They appear here once a client is online."
                />
            );
        case 'someOffline':
            return (
                <EmptyState
                    icon={Unplug}
                    title="No jobs on the clients that are online"
                    description={`${empty.offline} offline ${empty.offline === 1 ? 'client is' : 'clients are'} not shown: their jobs appear once they are online.`}
                />
            );
    }
};

export const JobList = ({
    jobs,
    onEditJob,
    onCreateJob,
    onTriggerJob,
    onDeleteJob,
    getClientStatus,
    getClientName,
    getLastRun,
    empty,
}: JobListProps) => {
    return (
        <BaseJobList
            jobs={jobs}
            title="Jobs"
            showClientColumn={true}
            // A job is saved on its client's agent: with none connected there is nowhere to.
            showNewJobButton={empty.kind !== 'allOffline'}
            onEditJob={onEditJob}
            onCreateJob={onCreateJob}
            onTriggerJob={onTriggerJob}
            onDeleteJob={onDeleteJob}
            getClientStatus={getClientStatus}
            getClientName={getClientName}
            getLastRun={getLastRun}
            emptyMessage={emptyMessage(empty)}
            viewModePersistKey="globalJobViewMode"
            pageSize={PAGE_SIZE.page}
        />
    );
};
