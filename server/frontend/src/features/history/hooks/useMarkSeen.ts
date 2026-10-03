import { useToast } from '@stefgo/react-ui-components';
import { useMarkAllSeen, useMarkRunSeen, useUnseen } from '../../../queries/history';

/**
 * Marking runs as seen, for the two pages that offer it: the dashboard and the history.
 * A mark that did not reach the server is said, since the run stays where it was and
 * nothing else on the page would tell why.
 */
export function useMarkSeen() {
    const { show } = useToast();
    const { unseen } = useUnseen();
    const markRun = useMarkRunSeen();
    const markAll = useMarkAllSeen();

    const failed = (error: Error) =>
        show({ variant: 'error', title: 'Could not mark as seen', description: error.message });

    return {
        /** How many runs "mark all" would take; 0 while that is not known. */
        unseenCount: (unseen?.failed ?? 0) + (unseen?.missed ?? 0),
        markRun: (runId: string) => markRun.mutate(runId, { onError: failed }),
        markAll: () => markAll.mutate(undefined, { onError: failed }),
        /** The run whose mark is on its way, so its button does not take a second click. */
        markingRunId: markRun.isPending ? markRun.variables : undefined,
        markingAll: markAll.isPending,
    };
}
