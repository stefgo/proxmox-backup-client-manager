import { CLIENT_STATUS, type ClientStatus } from '@pbcm/shared';
import { useConfirm, useToast } from '@stefgo/react-ui-components';
import { useClients } from '../../../queries/clients';
import { useDeleteJob, useTriggerJob } from '../../../queries/jobs';
import type { GlobalJob } from '../../../lib/cacheUpdates';
import { getErrorMessage } from '../../../utils';
import { describeDeleteJob } from '../confirmations';

/**
 * What a row of jobs across all clients can do, and what it needs to know of its client.
 * The job page and the dashboard's list of missed jobs both show such rows; this is the
 * one place their actions are written.
 */
export function useGlobalJobActions() {
    const { clients } = useClients();
    const { mutateAsync: triggerJob } = useTriggerJob();
    const { mutateAsync: deleteJob } = useDeleteJob();
    const { confirm } = useConfirm();
    const { show } = useToast();

    const getClientStatus = (clientId: string): ClientStatus => {
        const client = clients.find((c) => c.id === clientId);
        return client?.status || CLIENT_STATUS.OFFLINE;
    };

    const getClientName = (clientId: string) => {
        const client = clients.find((c) => c.id === clientId);
        return client?.displayName || client?.hostname || clientId;
    };

    const triggerNow = async (job: GlobalJob) => {
        if (!job.id) return;
        try {
            await triggerJob({ clientId: job.clientId, jobId: job.id });
            show({ variant: 'success', title: 'Job started' });
        } catch (e: unknown) {
            show({ variant: 'error', title: 'Could not start the job', description: getErrorMessage(e) });
        }
    };

    // The dialog stays open on failure, so the retry is one click away.
    const requestDelete = (job: GlobalJob) => {
        if (!job.id) return;
        const jobId = job.id;
        confirm({
            ...describeDeleteJob(job.name, getClientName(job.clientId)),
            onConfirm: () => deleteJob({ clientId: job.clientId, jobId }),
        });
    };

    return { getClientStatus, getClientName, triggerNow, requestDelete };
}
