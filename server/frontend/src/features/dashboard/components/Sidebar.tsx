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
import { Sidebar as LibSidebar, SidebarGroup } from '@stefgo/react-ui-components';

interface SidebarProps {
    view: string;
    setView: (view: any) => void;
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
    const groups: SidebarGroup[] = [
        {
            title: "Ressources",
            items: [
                {
                    id: "clients",
                    label: "Clients",
                    icon: <Monitor size={18} />,
                    active: view === "clients" && !selectedClient,
                    onClick: () => setView("clients"),
                    badge: `${stats.clients.active} / ${stats.clients.total}`
                },
                {
                    id: "jobs",
                    label: "Jobs",
                    icon: <HardDrive size={18} />,
                    active: view === "jobs",
                    onClick: () => setView("jobs"),
                    badge: `${stats.jobs.active} / ${stats.jobs.total}`
                },
                {
                    id: "repositories",
                    label: "Repositories",
                    icon: <ServerIcon size={18} />,
                    active: view === "repositories",
                    onClick: () => setView("repositories"),
                    badge: `${stats.repositories.active} / ${stats.repositories.total}`
                },
                {
                    id: "history",
                    label: "History",
                    icon: <Activity size={18} />,
                    active: view === "history",
                    onClick: () => setView("history")
                }
            ]
        },
        {
            title: "Administration",
            items: [
                {
                    id: "users",
                    label: "Users",
                    icon: <Users size={18} />,
                    active: view === "users",
                    onClick: () => setView("users")
                },
                {
                    id: "tokens",
                    label: "Client Tokens",
                    icon: <Key size={18} />,
                    active: view === "tokens",
                    onClick: () => setView("tokens")
                },
                {
                    id: "settings",
                    label: "Settings",
                    icon: <SettingsIcon size={18} />,
                    active: view === "settings",
                    onClick: () => setView("settings")
                }
            ]
        }
    ];

    return (
        <LibSidebar
            groups={groups}
            isCollapsed={isCollapsed}
        />
    );
};
