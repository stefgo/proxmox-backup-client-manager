import { ReactNode } from "react";
import { DashboardHeader } from "../components/DashboardHeader";
import { Sidebar } from "../components/Sidebar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { useUIStore } from "../../../stores/useUIStore";
import { Client } from "@pbcm/shared";

interface DashboardLayoutProps {
    children: ReactNode;
    view:
    | "clients"
    | "jobs"
    | "history"
    | "repositories"
    | "tokens"
    | "users"
    | "settings"
    | "client-detail"
    | "repository-detail";
    setView: (
        view:
            | "clients"
            | "jobs"
            | "history"
            | "repositories"
            | "tokens"
            | "users"
            | "settings",
    ) => void;
    selectedClient: Client | null;
    stats: {
        clients: { active: number; total: number };
        repositories: { active: number; total: number };
        jobs: { active: number; total: number };
    };
}

export const DashboardLayout = ({
    children,
    view,
    setView,
    selectedClient,
    stats,
}: DashboardLayoutProps) => {
    const { theme, toggleTheme } = useTheme();
    const { logout, token } = useAuth();
    const { isSidebarCollapsed } = useUIStore();

    let username = "User";
    try {
        if (token) {
            const payload = JSON.parse(atob(token.split(".")[1]));
            username = payload.username || payload.email || "User";
        }
    } catch (e) {
        console.error("Failed to parse token", e);
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#111] text-gray-900 dark:text-[#e0e0e0] font-sans flex flex-col transition-colors duration-300">
            <DashboardHeader
                theme={theme}
                toggleTheme={toggleTheme}
                logout={logout}
                username={username}
            />

            <div className="flex flex-1 overflow-hidden">
                <Sidebar
                    view={view}
                    setView={setView}
                    selectedClient={selectedClient}
                    stats={stats}
                    isCollapsed={isSidebarCollapsed}
                />

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-[#111]">
                    <div className="max-w-7xl mx-auto space-y-6">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
