import React, { useState } from 'react';
import { useJobFormContext } from '../../context/JobFormContext';
import { Download, Trash2 } from 'lucide-react';

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
            <label className="block text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase">Encryption</label>
            <div className="p-2 border dark:border-border-dark rounded bg-app-bg dark:bg-card-dark">
                {/* Toggle header */}
                <div
                    className={`flex items-center gap-2 ${isGenerating ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    onClick={handleToggle}
                >
                    <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${(encryptionEnabled || isGenerating) ? 'bg-accent' : 'dark:bg-border-dark'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${(encryptionEnabled || isGenerating) ? 'translate-x-4' : ''}`} />
                    </div>
                    <label className="text-xs font-bold text-text-muted dark:text-text-muted-dark uppercase cursor-pointer flex items-center gap-1">
                        {encryptionEnabled ? (isGenerating ? 'Generating Key...' : 'Enabled') : 'Disabled'}
                    </label>
                </div>

                {/* When a key exists and encryption is enabled: show download & drop buttons */}
                {encryptionKeyContent && encryptionEnabled && (
                    <div className="space-y-3 mt-2">
                        <div className="flex gap-2 text-sm">
                            <button
                                type="button"
                                onClick={handleDownloadKey}
                                className="flex-1 flex items-center justify-center py-2 px-3 border border-primary text-primary hover:bg-primary/10 rounded font-bold transition-colors"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Download Key (.json)
                            </button>
                            <button
                                type="button"
                                onClick={handleDropKey}
                                className="flex items-center justify-center py-2 px-3 border dark:border-border-dark text-text-muted dark:text-text-muted-dark hover:border-error hover:text-error rounded font-bold transition-colors"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Drop
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
