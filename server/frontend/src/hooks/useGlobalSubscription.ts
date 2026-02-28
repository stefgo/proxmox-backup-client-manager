import { useEffect } from 'react';
import { useGlobalJobsStore } from '../stores/useGlobalJobsStore';

export const useGlobalSubscription = () => {
    const { updateSession } = useGlobalJobsStore();

    useEffect(() => {
        const handleJobUpdate = (e: CustomEvent) => {
            const { job } = e.detail;
            updateSession(job);
        };

        window.addEventListener('pbcm:job_update', handleJobUpdate as EventListener);
        return () => window.removeEventListener('pbcm:job_update', handleJobUpdate as EventListener);
    }, [updateSession]);
};
