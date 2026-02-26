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
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-[#333] shadow-lg flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#252525] rounded-t-xl">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {repository ? 'Edit Repository' : 'Add Repository'}
                </h3>
                <button onClick={onCancel} className="text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">

                {/* Connection Settings */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Base URL <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            placeholder="https://pbs.example.com:8007"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Datastore <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            placeholder="Datastore Name"
                            value={datastore}
                            onChange={(e) => setDatastore(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Fingerprint</label>
                        <input
                            type="text"
                            placeholder="Optional Fingerprint"
                            value={fingerprint}
                            onChange={(e) => setFingerprint(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Username <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            placeholder="root@pam"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Token Name</label>
                        <input
                            type="text"
                            placeholder="mytoken (Optional)"
                            value={tokenName}
                            onChange={(e) => setTokenName(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1">Secret <span className="text-red-500">*</span></label>
                        <input
                            type="password"
                            placeholder="PBS Token Secret"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded px-3 py-2 text-gray-900 dark:text-white focus:border-[#E54D0D] outline-none"
                        />
                    </div>
                </div>

            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-[#333]">
                <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-200 dark:bg-[#333] hover:bg-gray-300 dark:hover:bg-[#444] text-gray-800 dark:text-white">Cancel</button>
                <button
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="px-4 py-2 rounded bg-[#E54D0D] hover:bg-[#ff5f1f] text-white"
                >
                    {repository ? 'Update' : 'Save'} Repository
                </button>
            </div>
        </div>
    );
};
