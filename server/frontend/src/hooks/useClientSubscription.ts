import { useEffect, useRef } from "react";
import { useClientDetailStore } from "../stores/useClientDetailStore";
import { HistoryEntry } from "@pbcm/shared";
import { subscribe } from "../lib/realtimeEvents";

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
        // No cast: the payload shape comes from the event map, so a mismatch between
        // what the provider emits and what this reads is a compile error, not a
        // runtime surprise.
        return subscribe("jobUpdate", ({ clientId: updateClientId, job }) => {
            if (updateClientId !== clientId) return;
            updateHistory(job);
            updateLastHistory(job);
            onJobUpdateRef.current?.(job);
        });
    }, [clientId, updateHistory, updateLastHistory]);
};
