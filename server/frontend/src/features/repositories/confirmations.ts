import { ManagedRepository as Repository } from '@pbcm/shared';
import type { ConfirmOptions } from '@stefgo/react-ui-components';

/**
 * A job does not lose its target: BackupJobSchema carries a full copy of the connection,
 * and the agent runs from that copy. What goes is the managed entry -- its status, its
 * snapshot browser, and the template new jobs pick.
 */
export function describeDeleteRepository(repo: Repository): ConfirmOptions {
    return {
        title: `Delete ${repo.baseUrl}:${repo.datastore}?`,
        description: 'Existing jobs keep their own copy of these credentials and go on running. Removed here are the managed entry, its status and its snapshot list -- and it is no longer offered when a job is created.',
        confirmLabel: 'Delete repository',
        variant: 'danger'
    };
}

/**
 * Follows RepositoryController.distribute: every job on a connected client that points at
 * this repository with a different fingerprint or secret is saved again with the stored
 * ones. Offline clients are skipped, not queued -- the part worth saying before, since the
 * result can only say it after.
 */
export function describeDistribute(): ConfirmOptions {
    return {
        title: 'Push the saved fingerprint and secret to all connected clients?',
        description: 'Every job on a connected client that uses this repository with a different fingerprint or secret is updated to the saved values. Offline clients are skipped and keep their old values until you distribute again.',
        confirmLabel: 'Distribute'
    };
}

/**
 * A restore writes into a directory on a machine, and `proxmox-backup-client restore`
 * does not ask before it replaces a file that is already there. So the dialog names where
 * it goes and what goes there -- the two things that cannot be taken back afterwards.
 */
export function describeRestore(clientName: string, targetPath: string, archives: string[]): ConfirmOptions {
    return {
        title: `Restore to ${targetPath} on ${clientName}?`,
        description: `${archives.length === 1 ? 'The archive' : 'The archives'} ${archives.join(', ')} ${archives.length === 1 ? 'is' : 'are'} written into ${targetPath}. Files of the same name that are already there are replaced.`,
        confirmLabel: 'Start restore',
        variant: 'danger'
    };
}
