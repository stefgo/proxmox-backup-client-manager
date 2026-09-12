import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { ActionButton, Card, Wizard, WizardStep } from '@stefgo/react-ui-components';
import { CONNECTION_MODE } from '@pbcm/shared';
import { apiFetch } from '../../../../lib/apiFetch';
import { useAddClientForm, isAllowedIpValid } from './useAddClientForm';
import { StepConnectionMode } from './steps/StepConnectionMode';
import { StepInboundDetails } from './steps/StepInboundDetails';
import { InboundTokenDialog } from './InboundTokenDialog';
import { StepOutboundDetails } from './steps/StepOutboundDetails';

interface AddClientWizardProps {
    /** Leaves the flow and hands the work area back to the client list. */
    onClose: () => void;
    /** A client was created and the list should catch up. */
    onCreated: () => void;
}

/**
 * Adds a client, in steps, starting with the decision that cannot be revised.
 *
 * The whole wizard is about one thing: how the server and this agent reach each
 * other. An SSH tunnel is not part of it — that is the route to the PBS, it can
 * be set up, changed and removed at any time, and it is offered from the client
 * list for clients of either mode.
 *
 * Lives in the dashboard's work area rather than in a modal, the same in-place
 * swap the client and repository editors use.
 *
 * The flow forks after step 1, so the step index is controlled here rather than
 * left to the `Wizard`: swapping the step array is the branch, and only this
 * component knows it happened.
 *
 * All form state lives in `useAddClientForm`, one level above the steps —
 * `Wizard` renders the current step alone, so a step holding its own inputs
 * would lose them on the way back.
 */
export const AddClientWizard = ({ onClose, onCreated }: AddClientWizardProps) => {
    const { mode, setMode, inbound, patchInbound, outbound, patchOutbound } = useAddClientForm();
    const [index, setIndex] = useState(0);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Issues the registration token — the inbound flow's create step.
     *
     * It lives here and not in a step because it is the wizard's terminal
     * action: the token comes back once, goes into the dialog, and the form
     * behind it is done. A step that issued it on entry would issue a second
     * one on every remount.
     */
    const handleCreateInbound = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await apiFetch('/api/v1/tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: inbound.displayName.trim() || undefined,
                    allowedIp: inbound.allowedIp.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not create a token');
            patchInbound({ token: data.token, expiresAt: data.expiresAt });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setCreating(false);
        }
    };

    /**
     * Creates the outbound client: the server dials the agent, registers, and the row
     * exists. Nothing to test beforehand — the registration handshake is the test.
     */
    const handleCreateOutbound = async () => {
        setCreating(true);
        setError(null);
        try {
            const res = await apiFetch('/api/v1/clients/outbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostname: outbound.hostname.trim() || undefined,
                    outboundTargetAddress: outbound.targetAddress.trim(),
                    registrationSecret: outbound.registrationSecret.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create client');
            onCreated();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setCreating(false);
        }
    };

    /**
     * Escape leaves the wizard, exactly like the header's button — the same exit the
     * client and tunnel editors give their forms.
     *
     * It listens on `window`, one step further out than every dialog and menu, which
     * listen on `document` and stop the event there. So an open select closes on its
     * own Escape and the wizard stays; the token dialog, which refuses Escape outright,
     * swallows it without the wizard closing behind it.
     */
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const modeStep: WizardStep = {
        id: 'mode',
        label: 'Connection',
        description: 'Which side dials',
        canContinue: !!mode,
        content: <StepConnectionMode mode={mode} onModeChange={setMode} />,
    };

    const inboundSteps: WizardStep[] = [
        {
            id: 'inbound-details',
            label: 'Agent',
            description: 'Get client token',
            canContinue: isAllowedIpValid(inbound.allowedIp),
            content: <StepInboundDetails form={inbound} onPatch={patchInbound} error={error} />,
        },
    ];

    const outboundSteps: WizardStep[] = [
        {
            id: 'outbound-details',
            label: 'Agent',
            description: 'Where to dial',
            canContinue: !!outbound.targetAddress.trim() && !!outbound.registrationSecret.trim(),
            content: (
                <StepOutboundDetails form={outbound} onPatch={patchOutbound} error={error} />
            ),
        },
    ];

    const steps: WizardStep[] = [
        modeStep,
        ...(mode === CONNECTION_MODE.INBOUND
            ? inboundSteps
            : mode === CONNECTION_MODE.OUTBOUND
              ? outboundSteps
              : []),
    ];

    // Going back to step 1 and picking the other mode swaps the array under the index,
    // which is controlled here — so clamp rather than let it point past the end.
    const safeIndex = Math.min(index, steps.length - 1);

    return (
        <Card
            className="flex flex-col"
            title="Add Client"
            action={<ActionButton icon={X} tooltip="Cancel" onClick={onClose} />}
            classNames={{ header: "py-6 px-7", headerTitle: "text-xl font-bold" }}
        >
            <Wizard
                steps={steps}
                value={safeIndex}
                onChange={setIndex}
                onCancel={onClose}
                onFinish={mode === CONNECTION_MODE.INBOUND ? handleCreateInbound : handleCreateOutbound}
                finishLabel="Create"
                finishIcon={KeyRound}
                isFinishing={creating}
            />

            {/* The token exists on the server from here on — the dialog is the
                only place it is ever shown in full, so closing it ends the flow. */}
            {inbound.token && <InboundTokenDialog form={inbound} onClose={onClose} />}
        </Card>
    );
};
