import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { BaseHistoryList, BaseHistoryItem } from "./BaseHistoryList";
import { apiFetch } from "../../../lib/apiFetch";
import { LoadingIndicator } from "../../../components/LoadingIndicator";

export const HistoryOverview = () => {
    const { token } = useAuth();
    const [history, setHistory] = useState<BaseHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!token) return;
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
    }, [token]);

    if (loading) {
        return <LoadingIndicator className="flex-1 h-full" />;
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

    return <BaseHistoryList items={history} showClientName={true} />;
};
