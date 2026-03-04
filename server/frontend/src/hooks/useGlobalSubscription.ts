import { useEffect } from "react";
import { useGlobalJobsStore } from "../stores/useGlobalJobsStore";

export const useGlobalSubscription = () => {
    const { updateSession, updateJobNextRunAt } = useGlobalJobsStore();

    useEffect(() => {
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
