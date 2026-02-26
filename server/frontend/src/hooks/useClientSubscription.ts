import { useEffect } from 'react';
import { useClientDetailStore } from '../stores/useClientDetailStore';

export const useClientSubscription = (clientId: string | null) => {
    const { updateHistory, updateSession } = useClientDetailStore();

    useEffect(() => {
        const handleJobUpdate = (e: CustomEvent) => {
            const { clientId: updateClientId, job } = e.detail;
            if (updateClientId === clientId) {
                updateHistory(job);
                updateSession(job);
            }
        };

        window.addEventListener('pbcm:job_update', handleJobUpdate as EventListener);
        return () => window.removeEventListener('pbcm:job_update', handleJobUpdate as EventListener);
    }, [clientId, updateHistory, updateSession]);
};
