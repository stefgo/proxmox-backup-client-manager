import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { BaseHistoryList, BaseHistoryItem } from "./BaseHistoryList";

export const HistoryOverview = () => {
    const { token } = useAuth();
    const [history, setHistory] = useState<BaseHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!token) return;
            try {
                const response = await fetch("/api/v1/history?limit=1000", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                const result = await response.json();
                if (result.success) {
                    setHistory(result.data);
                } else {
                    setError("Failed to fetch history");
                }
            } catch (err) {
                setError("An error occurred while fetching history");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [token]);

    if (loading) {
        return (
            <div className="flex-1 flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
                    {error}
                </div>
            </div>
        );
    }

    return <BaseHistoryList items={history} showClientName={true} />;
};
