import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ManagedRepository as Repository } from '@pbcm/shared';
// No broken local imports detected here but verifying

interface RepositoryEditorProps {
    repository?: Repository | null;
    onSave: (repo: Partial<Repository>) => Promise<void>;
    onCancel: () => void;
    isSaving?: boolean;
}

export const RepositoryEditor = ({ repository, onSave, onCancel, isSaving = false }: RepositoryEditorProps) => {
    const [baseUrl, setBaseUrl] = useState('');
    const [datastore, setDatastore] = useState('');
    const [fingerprint, setFingerprint] = useState('');
    const [username, setUsername] = useState('');
    const [tokenName, setTokenName] = useState('');
    const [secret, setSecret] = useState('');

    useEffect(() => {
        if (repository) {
            setBaseUrl(repository.baseUrl);
            setDatastore(repository.datastore);
            setFingerprint(repository.fingerprint || '');
            setUsername(repository.username);
            setTokenName(repository.tokenname || '');
            setSecret(repository.secret);
        } else {
            setBaseUrl('');
            setDatastore('');
            setFingerprint('');
            setUsername('');
            setTokenName('');
            setSecret('');
        }
    }, [repository]);

    const handleSubmit = async () => {
        if (!baseUrl || !datastore || !username || !secret) {
            alert('Please fill in all required fields');
            return;
        }

        await onSave({
            baseUrl,
            datastore,
            fingerprint,
            username,
            tokenname: tokenName,
            secret
        });
    };

    return (
        <div className="bg-app-card rounded-xl border border-gray-200 dark:border-app-border shadow-premium flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-app-border flex justify-between items-center bg-gray-50 dark:bg-app-input rounded-t-xl">
                <h3 className="text-xl font-bold text-gray-900 dark:text-app-text-main">
                    {repository ? 'Edit Repository' : 'Add Repository'}
                </h3>
                <button onClick={onCancel} className="text-gray-500 dark:text-app-text-muted hover:text-gray-900 dark:hover:text-app-text-main transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">

                {/* Connection Settings */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Base URL <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            placeholder="https://pbs.example.com:8007"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Datastore <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            placeholder="Datastore Name"
                            value={datastore}
                            onChange={(e) => setDatastore(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Fingerprint</label>
                        <input
                            type="text"
                            placeholder="Optional Fingerprint"
                            value={fingerprint}
                            onChange={(e) => setFingerprint(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Username <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            placeholder="root@pam"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Token Name</label>
                        <input
                            type="text"
                            placeholder="mytoken (Optional)"
                            value={tokenName}
                            onChange={(e) => setTokenName(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-app-text-muted uppercase mb-1">Secret <span className="text-red-500">*</span></label>
                        <input
                            type="password"
                            placeholder="PBS Token Secret"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-app-input border border-gray-200 dark:border-app-border rounded px-3 py-2 text-gray-900 dark:text-app-text-main focus:border-app-accent outline-none"
                        />
                    </div>
                </div>

            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-app-border">
                <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-200 dark:bg-app-input hover:bg-gray-300 dark:hover:bg-app-card text-gray-800 dark:text-app-text-main transition-colors">Cancel</button>
                <button
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="px-4 py-2 rounded bg-app-accent hover:bg-app-accent-hover text-white transition-colors shadow-glow-accent font-bold"
                >
                    {repository ? 'Update' : 'Save'} Repository
                </button>
            </div>
        </div>
    );
};
