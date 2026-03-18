import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Archive, BackupJob } from '@pbcm/shared';

interface UseJobFormProps {
    clientId: string | null;
    onSaveSuccess?: () => void;
}

export const useJobForm = ({ clientId, onSaveSuccess }: UseJobFormProps) => {
    const { token } = useAuth();

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
    const [jobRepository, setJobRepository] = useState<any | null>(null);
    const [isSelectingRepository, setIsSelectingRepository] = useState(false);

    // Encryption State
    const [encryptionEnabled, setEncryptionEnabled] = useState(false);
    const [encryptionKeyContent, setEncryptionKeyContent] = useState<string | null>(null);

    // File Browser State
    const [fileBrowserPath, setFileBrowserPath] = useState('.');

    // Scheduler State
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduleInterval, setScheduleInterval] = useState(24);
    const [scheduleUnit, setScheduleUnit] = useState<string>('hours');
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
        setScheduleStartDate(now.toISOString().split('T')[0]);
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        setScheduleStartTime(`${hours}:${minutes}`);

        setNewItemName('');
        setNewItemPath('');
        setFileBrowserPath('/');

        setJobRepository(null);
        setIsSelectingRepository(false);
        setEncryptionEnabled(false);
        setEncryptionKeyContent(null);
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
                setScheduleStartDate(d.toISOString().split('T')[0]);
                const hours = d.getHours().toString().padStart(2, '0');
                const minutes = d.getMinutes().toString().padStart(2, '0');
                setScheduleStartTime(`${hours}:${minutes}`);
            } else {
                const now = new Date();
                setScheduleStartDate(now.toISOString().split('T')[0]);
                const hours = now.getHours().toString().padStart(2, '0');
                const minutes = now.getMinutes().toString().padStart(2, '0');
                setScheduleStartTime(`${hours}:${minutes}`);
            }
        } else {
            setScheduleEnabled(false);
            setScheduleInterval(1);
            setScheduleUnit('days');
            const now = new Date();
            setScheduleStartDate(now.toISOString().split('T')[0]);
            setScheduleStartTime('00:00');
        }

        setJobRepository(job.repository || null);

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

        if (scheduleEnabled && (!scheduleStartDate || !scheduleStartTime)) {
            alert("Please provide a Start Date and Time for the schedule.");
            return;
        }

        try {
            const payload = {
                name: newJobName,
                archives: jobArchives,
                scheduleEnabled: scheduleEnabled ? 1 : 0,
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
                } : undefined
            };

            const res = await fetch(`/api/v1/clients/${clientId}/jobs`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setIsCreatingJob(false);
                setEditingJobId(null);
                if (onSaveSuccess) onSaveSuccess();
            } else {
                console.error('Failed to save backup job:', res.status, res.statusText);
                alert('Failed to save job');
            }
        } catch (e) { console.error(e); }
    };

    const generateKey = async (): Promise<boolean> => {
        if (!clientId) return false;
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/key`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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
