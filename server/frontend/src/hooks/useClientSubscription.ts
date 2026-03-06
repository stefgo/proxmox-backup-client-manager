import { useEffect } from "react";
import { useClientDetailStore } from "../stores/useClientDetailStore";

export const useClientSubscription = (
    clientId: string | null,
    onJobUpdate?: (job: any) => void,
) => {
    const { updateHistory, updateLastHistory } = useClientDetailStore();

    useEffect(() => {
        const handleJobUpdate = (e: CustomEvent) => {
            const { clientId: updateClientId, job } = e.detail;
            if (updateClientId === clientId) {
                updateHistory(job);
                updateLastHistory(job);
                if (onJobUpdate) onJobUpdate(job);
            }
        };

        window.addEventListener(
            "pbcm:job_update",
            handleJobUpdate as EventListener,
        );
        return () =>
            window.removeEventListener(
                "pbcm:job_update",
                handleJobUpdate as EventListener,
            );
    }, [clientId, updateHistory, updateLastHistory, onJobUpdate]);
};
