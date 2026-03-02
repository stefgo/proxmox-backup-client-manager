import React from 'react';
import {
    Monitor,
    HardDrive,
    Key,
    Users,
    Settings as SettingsIcon,
    Server as ServerIcon,
    Activity
} from "lucide-react";
import { Client } from "@pbcm/shared";

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    badge?: string;
    isCollapsed?: boolean;
}

const NavItem = ({ icon, label, active, onClick, badge, isCollapsed }: NavItemProps) => (
    <button
        onClick={onClick}
        title={isCollapsed ? label : ""}
        className={`w-full flex items-center ${isCollapsed ? "justify-center" : "justify-between"} px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${active
            ? "bg-white dark:bg-[#252525] text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-[#333]"
            : "text-gray-500 dark:text-[#888] hover:bg-gray-100 dark:hover:bg-[#222] hover:text-gray-900 dark:hover:text-white"
            }`}
    >
        <div className="flex items-center gap-3">
            {icon}
            {!isCollapsed && <span>{label}</span>}
        </div>
        {!isCollapsed && badge && (
            <span
                className={`text-xs px-2 py-0.5 rounded-full ${active
                    ? "bg-gray-100 dark:bg-[#333] text-gray-900 dark:text-white"
                    : "bg-gray-200 dark:bg-[#333] text-gray-600 dark:text-[#aaa]"
                    }`}
            >
                {badge}
            </span>
        )}
    </button>
);

interface SidebarProps {
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
    isCollapsed: boolean;
}

export const Sidebar = ({
    view,
    setView,
    selectedClient,
    stats,
    isCollapsed,
}: SidebarProps) => {
    return (
        <aside className={`${isCollapsed ? "w-16" : "w-64"} bg-gray-50 dark:bg-[#161616] border-r border-gray-200 dark:border-[#222] hidden md:flex flex-col transition-all duration-300 relative`}>
            <div className={`p-4 ${isCollapsed ? "pt-8 items-center" : "pt-8"} flex flex-1 flex-col gap-8 overflow-y-auto`}>
                <div className="space-y-1 w-full">
                    {!isCollapsed && (
                        <div className="text-gray-500 dark:text-[#666] text-xs font-bold uppercase tracking-wider px-3 mb-2">
                            Ressources
                        </div>
                    )}
                    <NavItem
                        icon={<Monitor size={18} />}
                        label="Clients"
                        active={view === "clients" && !selectedClient}
                        onClick={() => setView("clients")}
                        badge={`${stats.clients.active} / ${stats.clients.total}`}
                        isCollapsed={isCollapsed}
                    />
                    <NavItem
                        icon={<HardDrive size={18} />}
                        label="Jobs"
                        active={view === "jobs"}
                        onClick={() => setView("jobs")}
                        badge={`${stats.jobs.active} / ${stats.jobs.total}`}
                        isCollapsed={isCollapsed}
                    />
                    <NavItem
                        icon={<ServerIcon size={18} />}
                        label="Repositories"
                        active={view === "repositories"}
                        onClick={() => setView("repositories")}
                        badge={`${stats.repositories.active} / ${stats.repositories.total}`}
                        isCollapsed={isCollapsed}
                    />
                    <NavItem
                        icon={<Activity size={18} />}
                        label="History"
                        active={view === "history"}
                        onClick={() => setView("history")}
                        isCollapsed={isCollapsed}
                    />
                </div>

                <div className="space-y-1 w-full">
                    {!isCollapsed && (
                        <div className="text-gray-500 dark:text-[#666] text-xs font-bold uppercase tracking-wider px-3 mb-2">
                            Administration
                        </div>
                    )}
                    <NavItem
                        icon={<Users size={18} />}
                        label="Users"
                        active={view === "users"}
                        onClick={() => setView("users")}
                        isCollapsed={isCollapsed}
                    />
                    <NavItem
                        icon={<Key size={18} />}
                        label="Client Tokens"
                        active={view === "tokens"}
                        onClick={() => setView("tokens")}
                        isCollapsed={isCollapsed}
                    />
                    <NavItem
                        icon={<SettingsIcon size={18} />}
                        label="Settings"
                        active={view === "settings"}
                        onClick={() => setView("settings")}
                        isCollapsed={isCollapsed}
                    />
                </div>
            </div>
        </aside>
    );
};
