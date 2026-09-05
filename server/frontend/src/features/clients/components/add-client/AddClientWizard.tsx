import { useState } from 'react';
import { KeyRound, PlugZap, X } from 'lucide-react';
import { ActionButton, Card, Wizard, WizardStep } from '@stefgo/react-ui-components';
import { apiFetch } from '../../../../lib/apiFetch';
import { useAddClientForm, isAllowedIpValid, TunnelTestResult } from './useAddClientForm';
import { StepConnectionMode } from './steps/StepConnectionMode';
import { StepInboundDetails } from './steps/StepInboundDetails';
import { InboundTokenDialog } from './InboundTokenDialog';
import { StepOutboundAgent } from './steps/StepOutboundAgent';
import { StepOutboundSsh } from './steps/StepOutboundSsh';

interface AddClientWizardProps {
    token: string | null;
    /** Leaves the flow and hands the work area back to the client list. */
    onClose: () => void;
    /** A client was created and the list should catch up. */
    onCreated: () => void;
}

/**
 * Adds a client, in steps, starting with the decision that cannot be revised.
 *
 * Lives in the dashboard's work area, not in a modal: the outbound branch alone
 * carries an SSH key, a connection test and a fingerprint to confirm, which is
 * more than a dialog should hold — and the same in-place swap the client and
 * repository editors already use.
 *
 * The flow forks after step 1 and the two branches have different lengths, so
 * the step index is controlled here rather than left to the `Wizard`: swapping
 * the step array is the branch, and only this component knows it happened.
 *
 * All form state lives in `useAddClientForm`, one level above the steps —
 * `Wizard` renders the current step alone, so a step holding its own inputs
 * would lose them on the way back.
 */
export const AddClientWizard = ({ token, onClose, onCreated }: AddClientWizardProps) => {
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
     * Creates the outbound client — and, if one was asked for, tests its tunnel first.
     *
     * With a tunnel the two halves cannot be separated: the fingerprint the create
     * request pins is the one this very test was offered, and it is only trustworthy
     * for as long as nothing in between changes. The server verifies it again against
     * the host key it is actually presented, so a host that swaps its key between the
     * two calls fails the create rather than being pinned.
     *
     * Without a tunnel there is nothing to test — the client is created directly and
     * reaches the PBS on its own route.
     */
    const handleTestAndCreate = async () => {
        setCreating(true);
        setError(null);
        try {
            let tunnel: Record<string, unknown> | undefined;

            if (outbound.useTunnel) {
                const testRes = await apiFetch('/api/v1/tunnel/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sshHost: outbound.sshHost,
                        sshPort: Number(outbound.sshPort) || 22,
                        sshUser: outbound.sshUser,
                        privateKey: outbound.privateKey,
                        passphrase: outbound.passphrase || undefined,
                    }),
                });
                const test: TunnelTestResult = await testRes.json();
                patchOutbound({ test });
                if (!test.ok) throw new Error(test.error || 'Tunnel test failed');

                tunnel = {
                    sshHost: outbound.sshHost,
                    sshPort: Number(outbound.sshPort) || 22,
                    sshUser: outbound.sshUser,
                    privateKey: outbound.privateKey,
                    passphrase: outbound.passphrase || undefined,
                    hostKeySha256: test.hostKeySha256,
                };
            }

            const res = await apiFetch('/api/v1/clients/outbound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostname: outbound.hostname.trim() || undefined,
                    outboundTargetAddress: outbound.targetAddress.trim(),
                    registrationSecret: outbound.registrationSecret.trim(),
                    tunnel,
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

    const modeStep: WizardStep = {
        id: 'mode',
        label: 'Connection',
        canContinue: !!mode,
        content: <StepConnectionMode mode={mode} onModeChange={setMode} />,
    };

    const inboundSteps: WizardStep[] = [
        {
            id: 'inbound-details',
            label: 'Client',
            canContinue: isAllowedIpValid(inbound.allowedIp),
            content: <StepInboundDetails form={inbound} onPatch={patchInbound} error={error} />,
        },
    ];

    // The SSH step is part of the flow only when a tunnel was asked for: without one
    // there are no credentials to collect and nothing to test.
    const outboundSteps: WizardStep[] = [
        {
            id: 'outbound-agent',
            label: 'Agent',
            canContinue: !!outbound.targetAddress.trim() && !!outbound.registrationSecret.trim(),
            content: (
                <StepOutboundAgent form={outbound} onPatch={patchOutbound} error={error} />
            ),
        },
        ...(outbound.useTunnel
            ? [
                  {
                      id: 'outbound-ssh',
                      label: 'SSH',
                      canContinue:
                          !!outbound.sshHost.trim() &&
                          !!outbound.sshUser.trim() &&
                          !!outbound.privateKey.trim(),
                      content: (
                          <StepOutboundSsh
                              token={token}
                              form={outbound}
                              onPatch={patchOutbound}
                              error={error}
                          />
                      ),
                  },
              ]
            : []),
    ];

    const steps: WizardStep[] = [
        modeStep,
        ...(mode === 'inbound' ? inboundSteps : mode === 'outbound' ? outboundSteps : []),
    ];

    // Turning the tunnel off on the agent step removes the step after it. The index is
    // controlled here, so it would otherwise be left pointing past the end of the array.
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
                onFinish={mode === 'inbound' ? handleCreateInbound : handleTestAndCreate}
                finishLabel={
                    mode === 'inbound' || !outbound.useTunnel ? 'Create' : 'Test & Create'
                }
                finishIcon={
                    mode === 'inbound' || !outbound.useTunnel ? KeyRound : PlugZap
                }
                isFinishing={creating}
            />

            {/* The token exists on the server from here on — the dialog is the
                only place it is ever shown in full, so closing it ends the flow. */}
            {inbound.token && <InboundTokenDialog form={inbound} onClose={onClose} />}
        </Card>
    );
};
