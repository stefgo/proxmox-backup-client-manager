import React, { useState } from 'react';
import { useJobFormContext } from '../../context/JobFormContext';
import { Download, Trash2 } from 'lucide-react';
import { Switch, Button, ActionButton } from '@stefgo/react-ui-components';

export const JobEncryptionSettings: React.FC = () => {
    const {
        encryptionEnabled, setEncryptionEnabled,
        encryptionKeyContent, setEncryptionKeyContent,
        hasStoredKey, setHasStoredKey,
        generateKey,
    } = useJobFormContext();

    const [isGenerating, setIsGenerating] = useState(false);

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
        setEncryptionKeyContent(null);
        setHasStoredKey(false);
        setEncryptionEnabled(false);
    };

    const showKeyActions = Boolean(encryptionKeyContent || hasStoredKey) && encryptionEnabled;

    // Encryption is switched on only once there is a key. Enabling it first let a save
    // during generation store `enabled` without a key, which ran as a plain-text backup.
    const handleToggle = async () => {
        if (isGenerating) return;
        if (encryptionEnabled) {
            setEncryptionEnabled(false);
            return;
        }

        // A key still held by the agent is taken up again; only without one is a new
        // key generated.
        if (!encryptionKeyContent && !hasStoredKey) {
            setIsGenerating(true);
            const success = await generateKey();
            setIsGenerating(false);
            if (!success) return;
        }
        setEncryptionEnabled(true);
    };

    return (
        <div className="space-y-1">
            <label className="block text-xs font-bold text-text-muted uppercase">Encryption</label>
            <div className="p-2 border rounded bg-app-bg">
                {/* Toggle header, with the drop action beside it once there is a key */}
                <div className="flex items-center justify-between gap-2">
                    <Switch
                        value={encryptionEnabled || isGenerating}
                        onChange={handleToggle}
                        disabled={isGenerating}
                        label={isGenerating ? 'Generating Key...' : (encryptionEnabled ? 'Enabled' : 'Disabled')}
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
