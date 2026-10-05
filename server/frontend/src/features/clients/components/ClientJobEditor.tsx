import { ReactNode } from 'react';
import { Save, X } from 'lucide-react';
import type { ManagedRepository } from '@pbcm/shared';
import { JobScheduleSettings } from './job-editor/JobScheduleSettings';
import { JobRepositorySelect } from './job-editor/JobRepositorySelect';
import { JobArchiveEditor } from './job-editor/JobArchiveEditor';
import { JobArchiveList } from './job-editor/JobArchiveList';
import { JobExcludeEditor } from './job-editor/JobExcludeEditor';
import { JobExcludeList } from './job-editor/JobExcludeList';
import { JobEncryptionSettings } from './job-editor/JobEncryptionSettings';
import { JobTunnelSettings } from './job-editor/JobTunnelSettings';
import { JobFormProvider } from '../context/JobFormContext';
import type { JobForm } from '../hooks/useJobForm';
import { JOB_FORM_VIEW, type JobEditorView } from '../lib/jobEditorView';
import { Card, Button, Input, ActionButton, FieldLabel } from '@stefgo/react-ui-components';
import { HeaderBreadcrumb } from '../../app/HeaderBreadcrumb';

export interface ClientJobEditorProps {
    jobForm: JobForm;
    /** Held by the page, which also has to know it: Escape closes a panel before the page. */
    view: JobEditorView;
    onViewChange: (view: JobEditorView) => void;
    /**
     * The client this job runs on, rendered above the repository in the same shape.
     * Left out where the surface has no choice to offer.
     */
    clientField?: ReactNode;
    repositories: ManagedRepository[];
    /** What the X does. Closing is a navigation for the routed editor. */
    onClose: () => void;
    onSave: () => void;
}

/**
 * The job form and the panels it opens. The draft reaches the panels through context;
 * which of them is open is the page's, because the page decides what Escape closes.
 */
export const ClientJobEditor = ({
    jobForm,
    view,
    onViewChange,
    clientField,
    repositories,
    onClose,
    onSave,
}: ClientJobEditorProps) => {
    const { form, clientId, jobId, agentTimezone, tunnelAvailable } = jobForm;
    const { draft, set, errors } = form;
    const backToForm = () => onViewChange(JOB_FORM_VIEW);

    // Without a client there is no endpoint to save to. Said once the form holds work,
    // like every other field: before that the button is off because nothing was entered.
    const clientMissing = !clientId && form.isDirty;
    const footerError = form.saveError ?? form.formError;

    return (
        <JobFormProvider value={{ form, clientId, agentTimezone, tunnelAvailable }}>
            <Card
                className="flex flex-col"
                // The trail names the job; a narrow screen keeps the heading.
                title={<HeaderBreadcrumb>{jobId ? 'Edit Job' : 'New Backup Job'}</HeaderBreadcrumb>}
                action={
                    <ActionButton icon={X} tooltip="Close" onClick={onClose} />
                }
                classNames={{ header: 'py-6 px-7' }}
            >

                <div className="p-7 bg-card flex-1 overflow-hidden flex flex-col gap-6">
                    {/* The open client list takes the panel for itself, the way the
                        repository list does — the form underneath is not answerable
                        until the client it belongs to is settled. */}
                    {view.kind === 'client' ? clientField : (
                        <>
                            {jobId && (
                                <div>
                                    <FieldLabel>ID</FieldLabel>
                                    <div className="bg-hover border rounded-lg px-3 py-2.5 text-text-muted opacity-60 font-mono text-sm">
                                        {jobId}
                                    </div>
                                </div>
                            )}

                            <Input
                                label="Name"
                                required
                                value={draft.name}
                                onChange={(e) => set('name', e.target.value)}
                                error={errors.name}
                                placeholder="e.g. Production System"
                                classNames={{
                                    label: 'mb-2',
                                    input: 'bg-app-bg border-border'
                                }}
                            />

                            <div className="space-y-6">
                                {clientField && (
                                    <div>
                                        {clientField}
                                        {clientMissing && (
                                            <p className="mt-1 ml-1 text-xs text-error">Choose the client the job runs on.</p>
                                        )}
                                    </div>
                                )}

                                <JobRepositorySelect
                                    repositories={repositories}
                                    selectedRepository={draft.repository}
                                    onSelect={(repository) => set('repository', repository)}
                                    isSelecting={view.kind === 'repository'}
                                    onSetIsSelecting={(selecting) =>
                                        onViewChange(selecting ? { kind: 'repository' } : JOB_FORM_VIEW)
                                    }
                                    error={errors.repository}
                                />

                                {view.kind === 'repository' ? null : view.kind === 'archive' ? (
                                    <JobArchiveEditor index={view.index} onDone={backToForm} />
                                ) : view.kind === 'exclude' ? (
                                    <div className="space-y-6">
                                        <JobArchiveList readOnly />
                                        <JobExcludeEditor index={view.index} onDone={backToForm} />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <JobArchiveList onEdit={(index) => onViewChange({ kind: 'archive', index })} />
                                        <JobExcludeList onEdit={(index) => onViewChange({ kind: 'exclude', index })} />
                                        <JobEncryptionSettings />
                                        <JobTunnelSettings />
                                        <JobScheduleSettings />
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer -- the same shape the client and repository editors use: one
                    button for the form it sits under, and the outcome beside it rather
                    than in a browser dialog. Leaving is the X in the header, which is in
                    reach from every scroll position. */}
                <div className="p-6 bg-card flex items-center justify-end gap-4 border-t border-border">
                    {footerError && <span className="text-sm text-error mr-auto">{footerError}</span>}
                    {!footerError && form.saved && <span className="text-sm text-success mr-auto">Job saved</span>}
                    <Button
                        variant="primary"
                        onClick={onSave}
                        isLoading={form.isSaving}
                        disabled={!clientId || !form.canSave}
                        icon={Save}
                        className="shadow-glow-accent"
                    >
                        Save Job
                    </Button>
                </div>
            </Card >
        </JobFormProvider>
    );
};
