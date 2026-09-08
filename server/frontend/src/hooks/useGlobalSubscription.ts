import { useEffect } from "react";
import { useGlobalJobsStore } from "../stores/useGlobalJobsStore";

export const useGlobalSubscription = () => {
    const { updateSession, updateJobNextRunAt } = useGlobalJobsStore();

    useEffect(() => {
        // The JOB_UPDATE payload is { clientId, job }: the agent's status update
        // carries no client columns, so the id is what lets the store look the
        // client's name up -- dropping it here is what produced "Unknown Client".
        const handleJobUpdate = (e: CustomEvent) => {
            const { clientId, job } = e.detail;
            updateSession(clientId, job);
        };
        const handleNextRunUpdate = (e: CustomEvent) => {
            const { clientId, jobId, nextRunAt } = e.detail;
            updateJobNextRunAt(clientId, jobId, nextRunAt);
        };

        window.addEventListener(
            "pbcm:job_update",
            handleJobUpdate as EventListener,
        );
        window.addEventListener(
            "pbcm:job_next_run_update",
            handleNextRunUpdate as EventListener,
        );
        return () => {
            window.removeEventListener(
                "pbcm:job_update",
                handleJobUpdate as EventListener,
            );
            window.removeEventListener(
                "pbcm:job_next_run_update",
                handleNextRunUpdate as EventListener,
            );
        };
    }, [updateSession, updateJobNextRunAt]);
};
