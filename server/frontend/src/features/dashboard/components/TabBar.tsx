import { useState } from 'react';
import {
    Monitor,
    HardDrive,
    Settings as SettingsIcon,
    Server as ServerIcon,
    Activity,
    Shield,
    Users,
    Key,
    X
} from "lucide-react";
import { BottomNav, BottomNavItem } from '@stefgo/react-ui-components';

interface TabBarProps {
    view: string;
    setView: (view: any) => void;
}

export const TabBar = ({ view, setView }: TabBarProps) => {
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);

    const handleAdminClick = (newView: any) => {
        setView(newView);
        setIsAdminMenuOpen(false);
    };

    const isAdminView = ["settings", "users", "tokens"].includes(view);

    const navItems: BottomNavItem[] = [
        {
            id: "clients",
            icon: <Monitor size={24} />,
            active: (view === "clients" || view === "client-detail") && !isAdminMenuOpen,
            onClick: () => { setView("clients"); setIsAdminMenuOpen(false); }
        },
        {
            id: "jobs",
            icon: <HardDrive size={24} />,
            active: view === "jobs" && !isAdminMenuOpen,
            onClick: () => { setView("jobs"); setIsAdminMenuOpen(false); }
        },
        {
            id: "repositories",
            icon: <ServerIcon size={24} />,
            active: (view === "repositories" || view === "repository-detail") && !isAdminMenuOpen,
            onClick: () => { setView("repositories"); setIsAdminMenuOpen(false); }
        },
        {
            id: "history",
            icon: <Activity size={24} />,
            active: view === "history" && !isAdminMenuOpen,
            onClick: () => { setView("history"); setIsAdminMenuOpen(false); }
        },
        {
            id: "admin",
            icon: <Shield size={24} />,
            active: isAdminView || isAdminMenuOpen,
            onClick: () => setIsAdminMenuOpen(!isAdminMenuOpen)
        }
    ];

    return (
        <>
            {/* Administration Menu Overlay */}
            {isAdminMenuOpen && (
                <div className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-2xl p-6 pb-safe animate-in slide-in-from-bottom duration-300 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Shield className="text-orange-500" size={24} />
                                Administration
                            </h2>
                            <button
                                onClick={() => setIsAdminMenuOpen(false)}
                                className="p-2 rounded-full bg-gray-100 dark:bg-[#2a2a2a] text-gray-500"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => handleAdminClick("users")}
                                className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${view === "users"
                                    ? "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-500"
                                    : "bg-gray-50 dark:bg-[#222] text-gray-700 dark:text-[#ccc] hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
                                    }`}
                            >
                                <Users size={24} />
                                <span className="font-semibold text-lg">Benutzerverwaltung</span>
                            </button>

                            <button
                                onClick={() => handleAdminClick("tokens")}
                                className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${view === "tokens"
                                    ? "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-500"
                                    : "bg-gray-50 dark:bg-[#222] text-gray-700 dark:text-[#ccc] hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
                                    }`}
                            >
                                <Key size={24} />
                                <span className="font-semibold text-lg">Client Tokens</span>
                            </button>

                            <button
                                onClick={() => handleAdminClick("settings")}
                                className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${view === "settings"
                                    ? "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-500"
                                    : "bg-gray-50 dark:bg-[#222] text-gray-700 dark:text-[#ccc] hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
                                    }`}
                            >
                                <SettingsIcon size={24} />
                                <span className="font-semibold text-lg">Einstellungen</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav items={navItems} />
        </>
    );
};
