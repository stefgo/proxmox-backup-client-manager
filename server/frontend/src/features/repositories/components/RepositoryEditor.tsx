import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ManagedRepository as Repository } from '@pbcm/shared';
import { Card, Button, Input } from '@stefgo/react-ui-components';

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
        <Card
            className="flex flex-col"
            title={repository ? 'Edit Repository' : 'Add Repository'}
            action={
                <button onClick={onCancel} className="text-text-muted dark:text-text-muted-dark hover:text-text-primary transition-colors p-1 rounded-full hover:bg-hover dark:hover:bg-hover-dark">
                    <X size={20} />
                </button>
            }
            classNames={{ headerTitle: "text-xl font-bold" }}
        >
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
                <div className="space-y-4">
                    <Input
                        label="Base URL"
                        required
                        type="text"
                        placeholder="https://pbs.example.com:8007"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                    />
                    <Input
                        label="Datastore"
                        required
                        type="text"
                        placeholder="Datastore Name"
                        value={datastore}
                        onChange={(e) => setDatastore(e.target.value)}
                    />
                    <Input
                        label="Fingerprint"
                        type="text"
                        placeholder="Optional Fingerprint"
                        value={fingerprint}
                        onChange={(e) => setFingerprint(e.target.value)}
                    />
                    <Input
                        label="Username"
                        required
                        type="text"
                        placeholder="root@pam"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <Input
                        label="Token Name"
                        type="text"
                        placeholder="mytoken (Optional)"
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                    />
                    <Input
                        label="Secret"
                        required
                        type="password"
                        placeholder="PBS Token Secret"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="shadow-glow-accent"
                >
                    {repository ? 'Update' : 'Save'} Repository
                </Button>
            </div>
        </Card>
    );
};
