import { useEffect, useState } from 'react';
import { Archive, BackupJob, Repository, ScheduleConfig } from '@pbcm/shared';
import { apiFetch } from '../../../lib/apiFetch';
import { useClientStore } from '../../../stores/useClientStore';
import { toLocalDateInput, toLocalTimeInput } from '../../../utils';

interface UseJobFormProps {
    clientId: string | null;
    /** `wasEditing` says whether an existing job was updated or a new one created. */
    onSaveSuccess?: (wasEditing: boolean) => void;
}

export const useJobForm = ({ clientId, onSaveSuccess }: UseJobFormProps) => {

    // Editor State
    const [isCreatingJob, setIsCreatingJob] = useState(false);
    const [editingJobId, setEditingJobId] = useState<string | null>(null);
    const [newJobName, setNewJobName] = useState('');

    // Archives State
    const [jobArchives, setJobArchives] = useState<Archive[]>([]);
    const [isAddingArchive, setIsAddingArchive] = useState(false);
    const [editingArchiveIndex, setEditingArchiveIndex] = useState<number | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [newItemPath, setNewItemPath] = useState('');

    // Config State
    const [jobRepository, setJobRepository] = useState<Repository | null>(null);
    const [isSelectingRepository, setIsSelectingRepository] = useState(false);

    // Tunnel State — whether this job reaches its repository through the client's SSH
    // reverse tunnel. Per job, because a client can have one PBS it reaches directly and
    // another only through the detour.
    const [tunnelRequired, setTunnelRequired] = useState(false);

    // Whether the client has SSH credentials at all. Read from the store rather than
    // passed in: both callers already have the client id and nothing else to add. A job
    // that is already set to use the tunnel keeps the control usable even if the store
    // has no client row yet — otherwise the setting could be seen but never turned off.
    const tunnelConfigured = useClientStore(
        (s) => !!s.clients.find((c) => c.id === clientId)?.tunnelConfigured,
    );
    const tunnelAvailable = tunnelConfigured || tunnelRequired;

    // Encryption State
    const [encryptionEnabled, setEncryptionEnabled] = useState(false);
    const [encryptionKeyContent, setEncryptionKeyContent] = useState<string | null>(null);

    // File Browser State
    const [fileBrowserPath, setFileBrowserPath] = useState('.');

    // Save State -- reported in the editor's footer rather than through a browser dialog,
    // the same arrangement the client and repository editors use.
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);

    // Scheduler State
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduleInterval, setScheduleInterval] = useState(24);
    const [scheduleUnit, setScheduleUnit] = useState<ScheduleConfig['unit']>('hours');
    const [scheduleWeekdays, setScheduleWeekdays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    const [scheduleStartDate, setScheduleStartDate] = useState('');
    const [scheduleStartTime, setScheduleStartTime] = useState('');

    const startCreateJob = () => {
        setEditingJobId(null);
        setNewJobName('');
        setJobArchives([]);
        setIsCreatingJob(true);
        setIsAddingArchive(false);
        setEditingArchiveIndex(null);

        // Reset Schedule Defaults
        setScheduleEnabled(false);
        setScheduleInterval(1);
        setScheduleUnit('days');
        setScheduleWeekdays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

        const now = new Date();
        setScheduleStartDate(toLocalDateInput(now));
        setScheduleStartTime(toLocalTimeInput(now));

        setNewItemName('');
        setNewItemPath('');
        setFileBrowserPath('/');

        setJobRepository(null);
        setIsSelectingRepository(false);
        setEncryptionEnabled(false);
        setEncryptionKeyContent(null);
        setTunnelRequired(false);

        setSaveError(null);
        setJustSaved(false);
    };

    const startEditJob = (job: BackupJob) => {
        setNewJobName(job.name);
        setJobArchives(job.archives || []);
        setEditingJobId(job.id);
        setIsCreatingJob(true);
        setIsAddingArchive(false);

        if (job.schedule) {
            setScheduleEnabled(!!job.scheduleEnabled);
            setScheduleInterval(job.schedule.interval);
            setScheduleUnit(job.schedule.unit);
            setScheduleWeekdays(job.schedule.weekdays);

            if (job.nextRunAt) {
                const d = new Date(job.nextRunAt);
                setScheduleStartDate(toLocalDateInput(d));
                setScheduleStartTime(toLocalTimeInput(d));
            } else {
                const now = new Date();
                setScheduleStartDate(toLocalDateInput(now));
                setScheduleStartTime(toLocalTimeInput(now));
            }
        } else {
            setScheduleEnabled(false);
            setScheduleInterval(1);
            setScheduleUnit('days');
            const now = new Date();
            setScheduleStartDate(toLocalDateInput(now));
            setScheduleStartTime('00:00');
        }

        setJobRepository(job.repository || null);
        setTunnelRequired(!!job.tunnel?.required);

        if (job.encryption) {
            setEncryptionEnabled(job.encryption.enabled || false);
            setEncryptionKeyContent(job.encryption.keyContent || null);
        } else {
            setEncryptionEnabled(false);
            setEncryptionKeyContent(null);
        }

        setIsSelectingRepository(false);

        setSaveError(null);
        setJustSaved(false);
    };

    const sanitizeArchiveName = (name: string) => name.replace(/[^a-zA-Z0-9\-_ ]/g, '');

    const getDefaultNameFromPath = (path: string) => {
        if (!path || path === '' || path === '.') return 'current';
        if (path === '/') return 'root';
        const basename = path.split('/').filter(Boolean).pop();
        return basename ? sanitizeArchiveName(basename) : 'archive';
    };

    const addArchiveItem = () => {
        if (!newItemPath) return;

        const nameToUse = newItemName || getDefaultNameFromPath(newItemPath);

        const newItem: Archive = {
            path: newItemPath,
            name: nameToUse
        };

        if (editingArchiveIndex !== null) {
            const updated = [...jobArchives];
            updated[editingArchiveIndex] = newItem;
            setJobArchives(updated);
        } else {
            setJobArchives([...jobArchives, newItem]);
        }

        setIsAddingArchive(false);
        setEditingArchiveIndex(null);
        setNewItemName('');
        setNewItemPath('');
    };

    const handleEditArchiveItem = (index: number) => {
        const item = jobArchives[index];
        setNewItemName(item.name);
        setNewItemPath(item.path);

        const parentPath = getParentPath(item.path);
        setFileBrowserPath(parentPath || '/');

        setEditingArchiveIndex(index);
        setIsAddingArchive(true);
    };

    const getParentPath = (current: string) => {
        const parts = current.split('/').filter(Boolean);
        parts.pop();
        return '/' + parts.join('/');
    };

    const selectPath = (path: string) => {
        setNewItemPath(path);
        if (!newItemName) {
            setNewItemName(getDefaultNameFromPath(path));
        }
    };

    /**
     * Everything the job itself consists of, in one comparable value. The editor's fields
     * are too many for an honest `||` chain -- one forgotten field there means the exit
     * stops asking and the operator's work goes silently. UI state (the open file browser,
     * the half-typed archive) is left out: it is not part of the job.
     */
    const snapshot = JSON.stringify({
        newJobName,
        jobArchives,
        jobRepository,
        scheduleEnabled,
        scheduleInterval,
        scheduleUnit,
        scheduleWeekdays,
        scheduleStartDate,
        scheduleStartTime,
        encryptionEnabled,
        encryptionKeyContent,
        tunnelRequired,
    });

    /**
     * The state the job was last known to be in -- what it was seeded with, and after a
     * save what was stored. Captured in an effect rather than inside the two seeding
     * functions: those set the fields through a dozen setters, and the snapshot only
     * exists once React has applied them.
     */
    const [baseline, setBaseline] = useState<string | null>(null);
    useEffect(() => {
        if (isCreatingJob && baseline === null) setBaseline(snapshot);
    }, [isCreatingJob, baseline, snapshot]);

    const isDirty = baseline !== null && snapshot !== baseline;
    // The note stands only as long as what is on screen is what was stored.
    const saved = justSaved && !isDirty;

    /**
     * What the save button asks before enabling itself. The backend rejects a job without
     * a repository with a bare 400, and a schedule without a start has no first run -- so
     * both are decided here instead of in a dialog after the click.
     */
    const canSaveJob =
        isDirty &&
        !!clientId &&
        !!newJobName.trim() &&
        jobArchives.length > 0 &&
        !!jobRepository &&
        !(scheduleEnabled && (!scheduleStartDate || !scheduleStartTime));

    const saveBackupJob = async () => {
        // `canSaveJob` already covers this, but saveBackupJob is exported through
        // JobFormContextType and cannot rely on its caller for that.
        if (!canSaveJob || !clientId || !jobRepository) return;

        setIsSaving(true);
        setSaveError(null);
        setJustSaved(false);
        try {
            // Annotated so the payload is checked against the schema the backend
            // parses it with. That requires a real boolean: the 1/0 sent before
            // only survived because BackupJobSchema coerces it.
            const payload: Partial<BackupJob> = {
                name: newJobName,
                archives: jobArchives,
                scheduleEnabled: scheduleEnabled,
                nextRunAt: (scheduleStartDate && scheduleStartTime) ? new Date(`${scheduleStartDate}T${scheduleStartTime}`).toISOString() : undefined,
                schedule: {
                    interval: scheduleInterval,
                    unit: scheduleUnit,
                    weekdays: scheduleWeekdays
                },
                id: editingJobId,
                repository: jobRepository,
                encryption: encryptionEnabled ? {
                    enabled: true,
                    keyContent: encryptionKeyContent || undefined,
                } : undefined,
                // Always sent, including as `false`: leaving it out of an update would
                // let the previously stored route stand, and turning the tunnel off
                // would silently not take.
                tunnel: { required: tunnelRequired && tunnelAvailable },
            };

            const res = await apiFetch(`/api/v1/clients/${clientId}/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // What is on screen is now what is stored, so the form is pristine again
                // and the exit has nothing left to ask about.
                setBaseline(snapshot);
                setJustSaved(true);
                if (onSaveSuccess) onSaveSuccess(!!editingJobId);
            } else {
                // The backend refuses a job whose route the client cannot serve, and that
                // message names the setting that has to change. Dropping it left the
                // operator with a failure and no cause.
                const err = await res.json().catch(() => ({}));
                console.error('Failed to save backup job:', res.status, res.statusText, err);
                setSaveError(err.error || res.statusText || 'Failed to save job');
            }
        } catch (e) {
            console.error(e);
            setSaveError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsSaving(false);
        }
    };

    const generateKey = async (): Promise<boolean> => {
        if (!clientId) return false;
        try {
            const res = await apiFetch(`/api/v1/clients/${clientId}/key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (res.ok) {
                const data = await res.json();
                setEncryptionKeyContent(data.keyContent || null);
                return true;
            } else {
                const err = await res.json().catch(() => ({}));
                alert('Failed to generate key: ' + (err.error || res.statusText));
                return false;
            }
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    return {
        isCreatingJob, setIsCreatingJob, editingJobId,
        newJobName, setNewJobName,
        jobArchives, setJobArchives,
        isAddingArchive, setIsAddingArchive,
        editingArchiveIndex, setEditingArchiveIndex,
        jobRepository, setJobRepository,
        fileBrowserPath, setFileBrowserPath,
        newItemName, setNewItemName: (name: string) => setNewItemName(sanitizeArchiveName(name)),
        newItemPath, setNewItemPath,
        scheduleEnabled, setScheduleEnabled,
        scheduleInterval, setScheduleInterval,
        scheduleUnit, setScheduleUnit,
        scheduleWeekdays, setScheduleWeekdays,
        scheduleStartDate, setScheduleStartDate,
        scheduleStartTime, setScheduleStartTime,

        // Tunnel
        tunnelRequired, setTunnelRequired,
        tunnelAvailable,

        // Encryption
        encryptionEnabled, setEncryptionEnabled,
        encryptionKeyContent, setEncryptionKeyContent,
        generateKey,
        isSelectingRepository, setIsSelectingRepository,

        // Save
        isSaving, saveError, saved, isDirty, canSaveJob,

        // Actions
        startCreateJob,
        startEditJob,
        addArchiveItem,
        handleEditArchiveItem,
        selectPath,
        saveBackupJob,
        parentPath: getParentPath
    };
};
