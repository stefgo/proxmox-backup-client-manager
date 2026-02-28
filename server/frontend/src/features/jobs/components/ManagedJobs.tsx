import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useGlobalJobsStore } from '../../../stores/useGlobalJobsStore';
import { useClientStore } from '../../../stores/useClientStore';
import { GlobalJobList } from './GlobalJobList';
import { ClientHistoryList } from '../../clients/components/ClientHistoryList';
import { ClientJobEditor } from '../../clients/components/ClientJobEditor';
import { useJobForm } from '../../clients/hooks/useJobForm';
import { useRepositoryStore } from '../../../stores/useRepositoryStore';
import { useClientFileSystemStore } from '../../../stores/useClientFileSystemStore';
import { GlobalJob } from '../../../stores/useGlobalJobsStore';
import { useGlobalSubscription } from '../../../hooks/useGlobalSubscription';

export const ManagedJobs = () => {
    const { token } = useAuth();
    const { globalJobs, sessionHistory, fetchAllJobs, isLoading, error } = useGlobalJobsStore();
    const { clients, fetchClients } = useClientStore();
    const { repositories, fetchRepositories } = useRepositoryStore();
    const { fileList, isLoadingFiles, fetchFileList } = useClientFileSystemStore();

    const [isEditing, setIsEditing] = useState(false);
    const [editingJob, setEditingJob] = useState<GlobalJob | null>(null);

    // We reuse the hook, but we need to set the clientId dynamically based on what job is being edited
    // The useJobForm hook expects a fixed clientId initially, so we might need a workaround or adapt it.
    // Let's create a local wrapper for the form state since we edit jobs across clients.

    useEffect(() => {
        if (token) {
            fetchAllJobs(token);
            if (clients.length === 0) fetchClients(token);
            if (repositories.length === 0) fetchRepositories(token);
        }
    }, [token]);

    useGlobalSubscription();

    const handleRefresh = () => {
        if (token) fetchAllJobs(token);
    };

    const handleTriggerJob = async (clientId: string, jobId: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/jobs/${jobId}/run`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to trigger job');
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDeleteJob = async (clientId: string, jobId: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/jobs/${jobId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to delete job');
            handleRefresh();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const getClientStatus = (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        return client?.status || 'offline';
    };

    const getClientName = (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        return client?.displayName || client?.hostname || clientId;
    };

    // --- Editor Wrapper Logic ---
    // We use a separate state to handle editing, rendering ClientJobEditor exactly like ClientOverview does.
    const jobForm = useJobForm({
        clientId: editingJob?.clientId || '',
        onSaveSuccess: () => {
            setIsEditing(false);
            setEditingJob(null);
            handleRefresh();
        }
    });

    useEffect(() => {
        if (isEditing && editingJob && token) {
            fetchFileList(editingJob.clientId, jobForm.fileBrowserPath, token);
        }
    }, [isEditing, jobForm.fileBrowserPath, editingJob, token]);

    const handleEditJob = (job: GlobalJob) => {
        setEditingJob(job);
        // We need to bypass the standard startEditJob of useJobForm because it assumes a fixed clientId.
        // Or we just re-mount the form when a job is selected.
        setIsEditing(true);
    };

    if (isLoading && globalJobs.length === 0) {
        return <div className="p-8 text-center text-gray-500">Loading jobs...</div>;
    }

    if (error) {
        return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    }

    if (isEditing && editingJob) {
        // Render a dedicated JobEditor per selected job so the hook gets the right clientId on mount
        return <JobsEditorWrapper job={editingJob} onCancel={() => setIsEditing(false)} onSaveSuccess={handleRefresh} />;
    }

    return (
        <div className="space-y-6 flex flex-col">
            <div>
                <GlobalJobList
                    jobs={globalJobs}
                    onEditJob={handleEditJob}
                    onTriggerJob={handleTriggerJob}
                    onDeleteJob={handleDeleteJob}
                    getClientStatus={getClientStatus}
                    getClientName={getClientName}
                />
            </div>

            {sessionHistory.length > 0 && (
                <div className="mt-6">
                    <ClientHistoryList
                        title="Running Jobs (Session)"
                        history={sessionHistory}
                    />
                </div>
            )}
        </div>
    );
};


// Wrapper component to isolate the useJobForm hook with the specific clientId
const JobsEditorWrapper = ({ job, onCancel, onSaveSuccess }: { job: GlobalJob, onCancel: () => void, onSaveSuccess: () => void }) => {

    const { token } = useAuth();
    const { repositories } = useRepositoryStore();
    const { fileList, isLoadingFiles, fetchFileList } = useClientFileSystemStore();

    const jobForm = useJobForm({
        clientId: job.clientId,
        onSaveSuccess: onSaveSuccess
    });

    useEffect(() => {
        jobForm.startEditJob(job);
    }, []); // Run once on mount

    useEffect(() => {
        if (token && job.clientId) {
            fetchFileList(job.clientId, jobForm.fileBrowserPath, token);
        }
    }, [jobForm.fileBrowserPath, token]);


    return (
        <ClientJobEditor
            {...jobForm}
            cancelEditJob={onCancel}
            repositories={repositories}
            fileList={fileList}
            isLoadingFiles={isLoadingFiles}
        />
    );
}

