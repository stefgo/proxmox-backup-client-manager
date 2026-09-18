import type { AlertOptions, ConfirmOptions } from '@stefgo/react-ui-components';

export function describeDeleteUser(username: string): ConfirmOptions {
    return {
        title: `Delete user "${username}"?`,
        description: 'The account loses access to this interface immediately. Nothing else is removed with it -- clients, jobs and history belong to the installation, not to a user.',
        confirmLabel: 'Delete user',
        variant: 'danger'
    };
}

/**
 * Nothing is deleted here. The notice exists to say why the delete does not happen, in the
 * place where the operator asked for it.
 */
export function describeLastUser(username: string): AlertOptions {
    return {
        title: 'Cannot delete the last user',
        description: `"${username}" is the only account left. Deleting it would lock everyone out of this interface, so the server refuses it. Create a second user first.`
    };
}
