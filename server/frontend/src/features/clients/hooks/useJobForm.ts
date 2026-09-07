import { useState } from 'react';
import { Archive, BackupJob, Repository, ScheduleConfig } from '@pbcm/shared';
import { apiFetch } from '../../../lib/apiFetch';
import { useClientStore } from '../../../stores/useClientStore';
import { toLocalDateInput, toLocalTimeInput } from '../../../utils';

interface UseJobFormProps {
    clientId: string | null;
    onSaveSuccess?: () => void;
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

    const saveBackupJob = async () => {
        if (!clientId || !newJobName || jobArchives.length === 0) {
            alert("Please provide a Job Name and at least one Archive.");
            return;
        }

        // The editor button disables itself on the same condition, but saveBackupJob is
        // exported through JobFormContextType and cannot rely on its caller for that.
        // Without a repository the backend rejects the payload with a bare 400.
        if (!jobRepository) {
            alert("Please select a repository for this job.");
            return;
        }

        if (scheduleEnabled && (!scheduleStartDate || !scheduleStartTime)) {
            alert("Please provide a Start Date and Time for the schedule.");
            return;
        }

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
                setIsCreatingJob(false);
                setEditingJobId(null);
                if (onSaveSuccess) onSaveSuccess();
            } else {
                // The backend refuses a job whose route the client cannot serve, and that
                // message names the setting that has to change. Dropping it left the
                // operator with a failure and no cause.
                const err = await res.json().catch(() => ({}));
                console.error('Failed to save backup job:', res.status, res.statusText, err);
                alert('Failed to save job: ' + (err.error || res.statusText));
            }
        } catch (e) { console.error(e); }
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
