import React, { useState } from 'react';
import { useJobFormContext } from '../../context/JobFormContext';
import { Download, Trash2 } from 'lucide-react';
import { Switch, Button } from '@stefgo/react-ui-components';

export const JobEncryptionSettings: React.FC = () => {
    const {
        encryptionEnabled, setEncryptionEnabled,
        encryptionKeyContent, setEncryptionKeyContent,
        generateKey,
    } = useJobFormContext();

    const [isGenerating, setIsGenerating] = useState(false);

    const handleDownloadKey = () => {

        if (!encryptionKeyContent) return;
        const blob = new Blob([encryptionKeyContent], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pbcm_encryption_key.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const handleDropKey = () => {
        setEncryptionKeyContent(null);
        setEncryptionEnabled(false);
    };

    const handleToggle = async () => {
        if (isGenerating) return;
        const nextState = !encryptionEnabled;
        setEncryptionEnabled(nextState);

        if (nextState && !encryptionKeyContent) {
            setIsGenerating(true);
            const success = await generateKey();
            setIsGenerating(false);
            if (!success) {
                setEncryptionEnabled(false);
            }
        }
    };

    return (
        <div className="space-y-1">
            <label className="block text-xs font-bold text-text-muted uppercase">Encryption</label>
            <div className="p-2 border rounded bg-app-bg">
                {/* Toggle header */}
                <Switch
                    value={encryptionEnabled || isGenerating}
                    onChange={handleToggle}
                    disabled={isGenerating}
                    label={encryptionEnabled ? (isGenerating ? 'Generating Key...' : 'Enabled') : 'Disabled'}
                    classNames={{ label: 'text-xs font-bold text-text-muted uppercase cursor-pointer select-none' }}
                />

                {/* When a key exists and encryption is enabled: show download & drop buttons */}
                {encryptionKeyContent && encryptionEnabled && (
                    <div className="space-y-3 mt-2">
                        <div className="flex gap-2 text-sm">
                            {/*
                                `outline` and `outline-danger` are library
                                variants, not classes bolted onto `ghost`: the
                                bordered pair was being rebuilt by hand here and
                                in the UI library's own consumers, which is what
                                made it worth naming once.

                                Needs a library release: the installed
                                3.0.0-beta.2 has four variants, so `npm run
                                typecheck` fails on these two lines until the
                                dependency is bumped. `typecheck:local-ui` is
                                the one that speaks for this branch meanwhile.
                            */}
                            <Button
                                variant="outline"
                                icon={Download}
                                onClick={handleDownloadKey}
                                className="flex-1"
                            >
                                Download Key (.json)
                            </Button>
                            <Button
                                variant="outline-danger"
                                icon={Trash2}
                                onClick={handleDropKey}
                            >
                                Drop
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
