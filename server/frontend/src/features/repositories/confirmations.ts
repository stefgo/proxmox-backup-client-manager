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
 * Follows RepositoryController.distributeFingerprint: every job on a connected client that
 * points at this repository with a different fingerprint is saved again with the stored
 * one. Offline clients are skipped, not queued -- the part worth saying before, since the
 * result can only say it after.
 */
export function describeDistributeFingerprint(): ConfirmOptions {
    return {
        title: 'Push the saved fingerprint to all connected clients?',
        description: 'Every job on a connected client that uses this repository with a different fingerprint is updated to the saved one. Offline clients are skipped and keep their old fingerprint until you distribute again.',
        confirmLabel: 'Distribute'
    };
}
