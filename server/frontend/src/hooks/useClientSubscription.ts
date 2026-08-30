import { useEffect, useRef } from "react";
import { useClientDetailStore } from "../stores/useClientDetailStore";
import { HistoryEntry } from "@pbcm/shared";

export const useClientSubscription = (
    clientId: string | null,
    onJobUpdate?: (job: HistoryEntry) => void,
) => {
    const { updateHistory, updateLastHistory } = useClientDetailStore();

    // Held in a ref rather than listed as a dependency: callers pass an inline
    // function, so keeping it in the array re-registered the window listener on
    // every single render. The ref lets the listener stay put and still call the
    // latest callback.
    const onJobUpdateRef = useRef(onJobUpdate);
    useEffect(() => {
        onJobUpdateRef.current = onJobUpdate;
    }, [onJobUpdate]);

    useEffect(() => {
        const handleJobUpdate = (e: Event) => {
            const { clientId: updateClientId, job } = (
                e as CustomEvent<{ clientId: string; job: HistoryEntry }>
            ).detail;
            if (updateClientId === clientId) {
                updateHistory(job);
                updateLastHistory(job);
                onJobUpdateRef.current?.(job);
            }
        };

        window.addEventListener("pbcm:job_update", handleJobUpdate);
        return () =>
            window.removeEventListener("pbcm:job_update", handleJobUpdate);
    }, [clientId, updateHistory, updateLastHistory]);
};
