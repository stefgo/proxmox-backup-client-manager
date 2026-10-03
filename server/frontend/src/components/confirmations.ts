import type { ConfirmOptions } from '@stefgo/react-ui-components';

/** What leaving an editor keeps, per editor. The question and its buttons are the same everywhere. */
const DISCARD_CONSEQUENCE = {
    client: 'The client has not been saved. Leaving now keeps it as it was.',
    tunnel: 'The tunnel credentials have not been saved. Leaving now keeps the stored ones — or none, if there were none.',
    repository: 'The repository has not been saved. Leaving now keeps it as it was.',
    job: 'The job has not been saved. Leaving now keeps it as it was.',
    webhook: 'The webhook has not been saved. Leaving now keeps it as it was.'
} as const;

export type DiscardEditor = keyof typeof DISCARD_CONSEQUENCE;

/** Asked when an editor with unsaved changes is left, whichever way (see `useUnsavedChangesGuard`). */
export function describeDiscardChanges(editor: DiscardEditor): ConfirmOptions {
    return {
        title: 'Discard your changes?',
        description: DISCARD_CONSEQUENCE[editor],
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger'
    };
}
