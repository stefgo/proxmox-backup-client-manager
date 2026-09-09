import { useEffect } from "react";
import { useGlobalJobsStore } from "../stores/useGlobalJobsStore";
import { subscribe } from "../lib/realtimeEvents";

export const useGlobalSubscription = () => {
    const { updateSession, updateJobNextRunAt } = useGlobalJobsStore();

    useEffect(() => {
        // The jobUpdate payload is { clientId, job }: the agent's status update
        // carries no client columns, so the id is what lets the store look the
        // client's name up -- dropping it here is what produced "Unknown Client".
        const unsubscribeJob = subscribe("jobUpdate", ({ clientId, job }) => {
            updateSession(clientId, job);
        });

        const unsubscribeNextRun = subscribe(
            "jobNextRunUpdate",
            ({ clientId, jobId, nextRunAt }) => {
                updateJobNextRunAt(clientId, jobId, nextRunAt);
            },
        );

        return () => {
            unsubscribeJob();
            unsubscribeNextRun();
        };
    }, [updateSession, updateJobNextRunAt]);
};
