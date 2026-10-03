import { useConfirm } from '@stefgo/react-ui-components';
import { useAbortRun } from '../queries/jobs';
import { describeAbortRun } from '../features/jobs/confirmations';

interface RunToAbort {
    clientId: string;
    runId: string;
    /** What the run is called in the list it is aborted from. */
    name: string;
    /** `backup` or `restore`: what an abort leaves behind differs. */
    type: string;
}

/**
 * Aborts a run after asking. The one place this is done -- a history row and a job row
 * both offer it, and it is the same question and the same request.
 *
 * The dialog stays open on failure and shows the server's reason, so "the run had already
 * ended" is read where the abort was asked for. On success nothing is said here: the run
 * reports its own end, and the row it was aborted from changes to `abort`.
 */
export function useAbortRunAction() {
    const { confirm } = useConfirm();
    const { mutateAsync: abortRun } = useAbortRun();

    return ({ clientId, runId, name, type }: RunToAbort) => {
        void confirm({
            ...describeAbortRun(name, type),
            onConfirm: async () => {
                await abortRun({ clientId, runId });
            },
        });
    };
}
