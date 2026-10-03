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

/**
 * The agent stops `proxmox-backup-client` and the run ends as `abort`. What that leaves
 * differs by kind, and is the part to say before: a backup leaves nothing -- the PBS drops
 * a snapshot that was never finished -- while a restore leaves its target as far as it got.
 */
export function describeAbortRun(name: string, type: string): ConfirmOptions {
    const restore = type === 'restore';
    return {
        title: `Abort "${name}"?`,
        description: restore
            ? 'The restore stops where it is. Files already written stay in the target directory, so it is left partly restored.'
            : 'The backup stops where it is and leaves no snapshot. The next scheduled run is not affected.',
        confirmLabel: restore ? 'Abort restore' : 'Abort backup',
        cancelLabel: 'Keep running',
        variant: 'danger'
    };
}
