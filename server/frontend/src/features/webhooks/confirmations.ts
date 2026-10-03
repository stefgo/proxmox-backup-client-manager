import type { ConfirmOptions } from '@stefgo/react-ui-components';

/** Deleting a webhook stops it at once; a delivery already under way still finishes. */
export function describeDeleteWebhook(name: string): ConfirmOptions {
    return {
        title: `Delete the webhook "${name}"?`,
        description:
'Nothing is sent for it any more. A delivery that is already under way still finishes.',
        confirmLabel: 'Delete webhook',
        variant: 'danger',
    };
}
