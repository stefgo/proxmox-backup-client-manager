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

    const handleGenerateKey = async () => {
        setIsGenerating(true);
        try {
            await generateKey();
        } finally {
            setIsGenerating(false);
        }
    };

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
            await handleGenerateKey();
        }
    };

    return (
        <div className="space-y-1">
            <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase">Encryption</label>
            <div className="p-2 border border-gray-200 dark:border-[#333] rounded bg-gray-50 dark:bg-[#222]">
                {/* Toggle header */}
                <div
                    className={`flex items-center gap-2 ${isGenerating ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    onClick={handleToggle}
                >
                    <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${(encryptionEnabled || isGenerating) ? 'bg-app-accent' : 'bg-gray-300 dark:bg-[#444]'}`}>
                        <div className={`w-4 h-4 bg-app-light rounded-full shadow-md transform transition-transform ${(encryptionEnabled || isGenerating) ? 'translate-x-4' : ''}`} />
                    </div>
                    <label className="text-xs font-bold text-gray-500 dark:text-[#888] uppercase cursor-pointer flex items-center gap-1">
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
                                className="flex-1 flex items-center justify-center py-2 px-3 border border-[#E54D0D] text-[#E54D0D] hover:bg-app-accent/10 rounded font-bold transition-colors"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Download Key (.json)
                            </button>
                            <button
                                type="button"
                                onClick={handleDropKey}
                                className="flex items-center justify-center py-2 px-3 border border-gray-400 dark:border-[#555] text-gray-600 dark:text-[#aaa] hover:border-red-500 hover:text-red-500 rounded font-bold transition-colors"
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
