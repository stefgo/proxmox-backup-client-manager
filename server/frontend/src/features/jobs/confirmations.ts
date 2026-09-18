import type { ConfirmOptions } from '@stefgo/react-ui-components';

/**
 * The request runs through the agent (JOB_DELETE_CONFIG), which drops the config and its
 * schedule state -- so it needs the client online, and the dialog says so. Deleted is the
 * configuration, not the backups: the snapshots in the repository and the history rows both
 * stay. The global job list and a client's job tab ask the same question: it is the same
 * operation.
 */
export function describeDeleteJob(jobName: string, clientName: string): ConfirmOptions {
    return {
        title: `Delete job "${jobName}"?`,
        description: `The agent on ${clientName} drops the job and its schedule, so the client has to be online for this. Snapshots already in the repository and the run history stay.`,
        confirmLabel: 'Delete job',
        variant: 'danger'
    };
}
