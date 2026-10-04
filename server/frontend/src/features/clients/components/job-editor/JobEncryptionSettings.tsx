import React, { useState } from 'react';
import { useJobFormContext } from '../../context/JobFormContext';
import { Download, Trash2 } from 'lucide-react';
import { Switch, Button, ActionButton, useConfirm, FieldLabel } from '@stefgo/react-ui-components';
import { ApiError } from '../../../../lib/api';
import { generateEncryptionKey } from '../../../../queries/jobs';
import { describeFailure } from '../../../../utils';

export const JobEncryptionSettings: React.FC = () => {
    const { form, clientId } = useJobFormContext();
    const { encryptionEnabled, keyContent: encryptionKeyContent, hasStoredKey } = form.draft;
    const { alert } = useConfirm();

    const [isGenerating, setIsGenerating] = useState(false);

    /** The key the agent made, or `null` when it made none -- with the reason said, if there is one. */
    const generateKey = async (): Promise<string | null> => {
        if (!clientId) return null;
        try {
            return (await generateEncryptionKey(clientId)).keyContent || null;
        } catch (e) {
            console.error(e);
            // A refusal is explained; a request that never reached the server only fails,
            // as it always has.
            if (e instanceof ApiError) alert(describeFailure('Could not generate the key', e.message));
            return null;
        }
    };

    const handleDownloadKey = () => {

        if (!encryptionKeyContent) return;
        const blob = new Blob([encryptionKeyContent], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pbcm_encryption_key.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const handleDropKey = () => {
        form.patch({ keyContent: null, hasStoredKey: false, encryptionEnabled: false });
    };

    const showKeyActions = Boolean(encryptionKeyContent || hasStoredKey) && encryptionEnabled;

    // Encryption is switched on only once there is a key. Enabling it first let a save
    // during generation store `enabled` without a key, which ran as a plain-text backup.
    const handleToggle = async () => {
        if (isGenerating) return;
        if (encryptionEnabled) {
            form.set('encryptionEnabled', false);
            return;
        }

        // A key still held by the agent is taken up again; only without one is a new
        // key generated.
        if (!encryptionKeyContent && !hasStoredKey) {
            setIsGenerating(true);
            const keyContent = await generateKey();
            setIsGenerating(false);
            if (!keyContent) return;
            // In one step: a draft that has encryption on is never without its key.
            form.patch({ keyContent, encryptionEnabled: true });
            return;
        }
        form.set('encryptionEnabled', true);
    };

    return (
        <div className="space-y-1">
            <FieldLabel className="mb-0 ml-0">Encryption</FieldLabel>
            <div className="p-2 border rounded bg-app-bg">
                {/* Toggle header, with the drop action beside it once there is a key */}
                <div className="flex items-center justify-between gap-2">
                    <Switch
                        value={encryptionEnabled || isGenerating}
                        onChange={handleToggle}
                        disabled={isGenerating}
                        label={isGenerating ? 'Generating Key...' : (encryptionEnabled ? 'Enabled' : 'Disabled')}
                        error={form.errors.encryptionEnabled}
                        classNames={{ label: 'text-xs font-bold text-text-muted uppercase cursor-pointer select-none' }}
                    />
                    {showKeyActions && (
                        <ActionButton
                            icon={Trash2}
                            size="sm"
                            color="error"
                            tooltip="Drop key"
                            aria-label="Drop key"
                            onClick={handleDropKey}
                        />
                    )}
                </div>

                {/* When a key exists and encryption is enabled: download (only for a key
                    generated here -- a stored one never comes back to the browser) */}
                {showKeyActions && (
                    <div className="space-y-3 mt-2">
                        {!encryptionKeyContent && (
                            <p className="text-xs text-text-muted">
                                The key is stored on the client. It can only be downloaded right
                                after it was generated — drop it and enable encryption again for a
                                new one.
                            </p>
                        )}
                        {encryptionKeyContent && (
                            <div className="flex gap-2 text-sm">
                                {/*
                                    `outline` is a library variant, not classes
                                    bolted onto `ghost`: the bordered button was
                                    being rebuilt by hand here and in the UI
                                    library's own consumers, which is what made it
                                    worth naming once.
                                */}
                                <Button
                                    variant="outline"
                                    icon={Download}
                                    onClick={handleDownloadKey}
                                    className="flex-1"
                                >
                                    Download Key (.json)
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
