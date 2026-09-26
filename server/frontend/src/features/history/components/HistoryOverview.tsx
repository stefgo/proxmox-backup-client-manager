import { useEffect, useMemo, useState } from "react";
import { JOB_STATUS } from "@pbcm/shared";
import { Switch } from "@stefgo/react-ui-components";
import { useAuth } from "../../auth/AuthContext";
import { BaseHistoryList, BaseHistoryItem } from "./BaseHistoryList";
import { apiFetch } from "../../../lib/apiFetch";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { useHistorySeenStore } from "../../../stores/useHistorySeenStore";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";

export const HistoryOverview = () => {
    const { isAuthenticated } = useAuth();
    const [history, setHistory] = useState<BaseHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const markSeen = useHistorySeenStore((s) => s.markSeen);
    // In the URL, so a link from the failure dot or a colleague lands on the same view.
    const [status, setStatus] = useSearchQueryParam("status");
    const failedOnly = status === JOB_STATUS.FAILED;
    const visible = useMemo(
        () => (failedOnly ? history.filter((h) => h.status === JOB_STATUS.FAILED) : history),
        [history, failedOnly],
    );

    // Seen on the way in and again on the way out: a failure that arrives while the page
    // is open appears in it, so it has been seen as well.
    useEffect(() => {
        markSeen();
        return () => {
            markSeen();
        };
    }, [markSeen]);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!isAuthenticated) return;
            try {
                const response = await apiFetch("/api/v1/history?limit=1000", {
                    headers: {
                    },
                });
                const result = await response.json();
                if (result.success) {
                    setHistory(result.data);
                } else {
                    setError("Failed to fetch history");
                }
            } catch {
                setError("An error occurred while fetching history");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [isAuthenticated]);

    if (loading) {
        return <LoadingIndicator label="Loading history…" />;
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-error-bg text-error p-4 rounded-md">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <BaseHistoryList
            items={visible}
            showClientName={true}
            emptyMessage={failedOnly ? "No failed runs" : undefined}
            action={
                <Switch
                    label="Failures only"
                    value={failedOnly}
                    onChange={(on) => setStatus(on ? JOB_STATUS.FAILED : "")}
                />
            }
        />
    );
};
