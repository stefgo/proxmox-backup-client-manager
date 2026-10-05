import { useState } from 'react';
import { X, AlertCircle, RotateCcw } from 'lucide-react';
import { Client, ManagedRepository as Repository, RestoreRequestSchema } from '@pbcm/shared';
import { Snapshot } from '@pbcm/shared';
import { useClientFiles } from '../../../queries/fileSystem';
import { useStartRestore } from '../../../queries/jobs';
import {
    ActionButton,
    Button,
    Card,
    Checkbox,
    FileBrowser,
    FormField,
    Input,
    useConfirm,
} from '@stefgo/react-ui-components';
import { ClientSelect } from '../../clients/components/ClientSelect';
import { formatDate, getErrorMessage } from '../../../utils';
import { EntityLink } from '../../../components/EntityLink';
import { clientTab } from '../../../lib/paths';
import { checkDraft } from '../../../lib/entityForm';
import { describeRestore } from '../confirmations';
import {
    archiveLabel,
    restorableArchives,
    restoreDraftFrom,
    restoreFieldOf,
    restoreInputFrom,
    restoreRules,
    type RestoreDraft,
} from '../lib/restoreForm';
import { HeaderBreadcrumb } from '../../app/HeaderBreadcrumb';

interface SnapshotRestoreEditorProps {
    onCancel: () => void;
    snapshot: Snapshot;
    repo: Repository;
    clients?: Client[];
    selectedClient?: Client;
}

const EMPTY_CLIENTS: Client[] = [];

/**
 * Starts a restore of one snapshot. Laid out like the editors -- the X in the card header
 * leaves, the one button sits under the fields it sends, and what became of it is said
 * next to that button.
 *
 * It is not one of them, though: nothing is saved here, so there is no baseline a draft
 * could differ from, and `useEntityForm` -- which holds its messages back until something
 * was changed -- would leave a form that opens filled in but for the target with a dead
 * button and no reason. The draft is checked by the same rules (`checkDraft`, against the
 * schema the backend parses the request with), and what is missing is said from the start.
 */
export const SnapshotRestoreEditor = ({ onCancel, snapshot, repo, clients = EMPTY_CLIENTS, selectedClient }: SnapshotRestoreEditorProps) => {
    const { confirm } = useConfirm();
    const { mutateAsync: startRestore, isPending: isStarting } = useStartRestore();

    const [draft, setDraft] = useState<RestoreDraft>(() => restoreDraftFrom(snapshot, selectedClient, clients));
    // ClientSelect only opens its list when it is told to. Without this state the
    // "Set Client" button had nothing to call and the preselected client was final.
    const [isSelectingClient, setIsSelectingClient] = useState(false);
    const [browserPath, setBrowserPath] = useState('/');
    const [startError, setStartError] = useState<string | null>(null);
    // A started restore used to leave the form looking untouched, which invites
    // triggering it a second time. What was started doubles as the button's lock.
    const [started, setStarted] = useState<{ archives: number; clientId: string } | null>(null);

    /** Any change describes another restore: what was said about the last one no longer applies. */
    const change = (changes: Partial<RestoreDraft>) => {
        setDraft((prev) => ({ ...prev, ...changes }));
        setStarted(null);
        setStartError(null);
    };

    // Another snapshot starts the form over. Done while rendering rather than in an effect,
    // so no frame shows the previous snapshot's choices. Keyed on the snapshot alone: a
    // client list that refreshes must not undo a client picked by hand.
    const [seededSnapshot, setSeededSnapshot] = useState(snapshot);
    if (snapshot !== seededSnapshot) {
        setSeededSnapshot(snapshot);
        setDraft(restoreDraftFrom(snapshot, selectedClient, clients, draft.clientId));
        setBrowserPath('/');
        setIsSelectingClient(false);
        setStarted(null);
        setStartError(null);
    }

    // The client can still be swapped in the form, so everything below follows the
    // selection and not the client this editor was opened for.
    const restoreClient = selectedClient?.id === draft.clientId
        ? selectedClient
        : clients.find((c) => c.id === draft.clientId);
    const tunnelAvailable = !!restoreClient?.tunnelConfigured;

    const availableArchives = restorableArchives(snapshot);

    const check = checkDraft(
        {
            schema: RestoreRequestSchema,
            toInput: (value: RestoreDraft) => restoreInputFrom(value, { snapshot, repoId: repo.id, tunnelAvailable }),
            fieldOf: restoreFieldOf,
            rules: (value: RestoreDraft) => restoreRules(value, restoreClient),
        },
        draft,
    );
    const { errors } = check;

    // The directory the browser shows, on the client the restore goes to.
    const { fileList, isLoadingFiles, error: fileListError } = useClientFiles(draft.clientId, browserPath);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // The button asks the same, but a form is also submitted by Enter.
        if (!check.isValid || check.input === null || !restoreClient || started || isStarting) return;
        const request = check.input;
        const clientName = restoreClient.displayName || restoreClient.hostname;
        if (!(await confirm(describeRestore(clientName, request.targetPath, draft.archives.map(archiveLabel))))) return;

        setStartError(null);
        try {
            await startRestore({ clientId: restoreClient.id, request });
            setStarted({ archives: request.archives.length, clientId: restoreClient.id });
        } catch (e: unknown) {
            console.error(e);
            setStartError(getErrorMessage(e));
        }
    };

    const toggleArchive = (arch: string) => {
        change({
            archives: draft.archives.includes(arch)
                ? draft.archives.filter((a) => a !== arch)
                : [...draft.archives, arch],
        });
    };

    const footerError = startError ?? check.formError;

    return (
        <Card
            className="flex flex-col"
            title={<HeaderBreadcrumb current="Restore Snapshot">Restore Snapshot</HeaderBreadcrumb>}
            action={<ActionButton icon={X} tooltip="Close" onClick={onCancel} />}
        >
            <form onSubmit={handleSubmit} className="flex flex-col">
                <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
                    <div className="text-xs text-text-muted font-mono">
                        {snapshot.backupType}/{snapshot.backupId} ({snapshot.backupTime ? formatDate(snapshot.backupTime * 1000) : 'Unknown Date'})
                    </div>

                    <FormField label="Archives" required error={errors.archives}>
                        {() =>
                            availableArchives.length > 0 ? (
                                <div className="border border-border rounded overflow-hidden">
                                    {availableArchives.map((arch) => (
                                        <Checkbox
                                            key={arch}
                                            className="p-2 hover:bg-hover border-b last:border-0 border-border"
                                            // `flex-1` on the label, so the whole row toggles the box
                                            // and not just the words: the label is a sibling of the
                                            // box inside a flex row, so it has to be told to take the
                                            // rest of the width.
                                            classNames={{ label: 'flex-1 text-sm font-mono text-text-muted' }}
                                            label={archiveLabel(arch)}
                                            checked={draft.archives.includes(arch)}
                                            onChange={() => toggleArchive(arch)}
                                            disabled={isStarting}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="p-3 text-sm text-text-muted bg-app-bg rounded border border-border flex items-center gap-2">
                                    <AlertCircle size={16} /> No archives found in this snapshot.
                                </div>
                            )
                        }
                    </FormField>

                    {/* Shown also when the form was opened for one client: locked then, but
                        still the place that says the client is offline. */}
                    <FormField error={errors.clientId}>
                        {() => (
                            <ClientSelect
                                clients={selectedClient ? [selectedClient] : clients}
                                selectedClientId={draft.clientId}
                                locked={!!selectedClient}
                                disableOffline
                                isSelecting={isSelectingClient}
                                onSetIsSelecting={setIsSelectingClient}
                                onSelect={(id) => {
                                    // Another machine: its directories are not the ones on screen.
                                    change({ clientId: id, targetPath: '' });
                                    setBrowserPath('/');
                                }}
                            />
                        )}
                    </FormField>

                    {/* Only for a client that has credentials. Hidden rather than disabled:
                        a client with no tunnel has no choice to make, and an inert switch
                        would raise a question the operator cannot act on from here. */}
                    {tunnelAvailable && (
                        <Checkbox
                            label="Restore through the SSH reverse tunnel"
                            checked={draft.useTunnel}
                            onChange={() => change({ useTunnel: !draft.useTunnel })}
                            error={errors.useTunnel}
                            disabled={isStarting}
                            classNames={{ label: 'text-sm text-text-muted' }}
                        />
                    )}

                    <div className="flex flex-col gap-2">
                        {/* Typed or picked: a directory that does not exist yet cannot be
                            clicked, and a known path is quicker typed than walked to. */}
                        <Input
                            label="Target Directory"
                            required
                            type="text"
                            placeholder="/path/on/the/client"
                            value={draft.targetPath}
                            onChange={(e) => change({ targetPath: e.target.value })}
                            error={errors.targetPath}
                            disabled={isStarting}
                            classNames={{ input: 'font-mono' }}
                        />
                        {restoreClient && (
                            <>
                                <FileBrowser
                                    currentPath={browserPath}
                                    onNavigate={setBrowserPath}
                                    files={fileList}
                                    isLoading={isLoadingFiles}
                                    onSelect={(path) => change({ targetPath: path })}
                                    className="flex-1 min-h-[250px] max-h-[300px]"
                                />
                                {fileListError && <div className="text-xs text-error">{fileListError}</div>}
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-4 border-t border-border px-6 py-5">
                    {footerError && <span className="text-sm text-error mr-auto">{footerError}</span>}
                    {!footerError && started && (
                        <span className="text-sm text-success mr-auto">
                            Restore of {started.archives} archive(s) started — follow it in the{' '}
                            {/* Of the client the restore went to, which the form may have changed since. */}
                            <EntityLink to={clientTab(started.clientId, 'history')} className="underline">
                                client's job history
                            </EntityLink>
                            . Change the selection to start another.
                        </span>
                    )}
                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={isStarting}
                        disabled={!check.isValid || !!started || isStarting}
                        icon={RotateCcw}
                        className="shadow-glow-accent"
                    >
                        Restore Content
                    </Button>
                </div>
            </form>
        </Card>
    );
};
