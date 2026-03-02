import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, LogOut, User, ChevronDown, Menu } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';

interface DashboardHeaderProps {
    theme: string;
    toggleTheme: () => void;
    logout: () => void;
    username: string;
}

export const DashboardHeader = ({ theme, toggleTheme, logout, username }: DashboardHeaderProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { toggleSidebarCollapsed } = useUIStore();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <header className="px-5 py-3 border-b border-gray-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e] sticky top-0 z-40 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button
                    onClick={toggleSidebarCollapsed}
                    className="p-2 -ml-2 mr-2 text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white transition-colors md:flex hidden"
                    title="Toggle Sidebar"
                >
                    <Menu size={20} />
                </button>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E54D0D] to-[#ff7e47] flex items-center justify-center shadow-lg shadow-orange-900/20 text-white leading-none">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                        <path d="M12 12v-4" />
                        <path d="M12 12l2-2" />
                        <path d="M12 12l-2-2" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">P<span className="text-[#E54D0D]">BC</span>M</h1>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button onClick={toggleTheme} className="p-2 flex items-center gap-2 text-gray-500 dark:text-[#888] hover:text-gray-900 dark:hover:text-white transition-colors">
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="flex items-center gap-2 text-gray-700 dark:text-[#ccc] hover:text-gray-900 dark:hover:text-white transition-colors p-1 pr-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
                    >
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-[#333] flex items-center justify-center text-gray-600 dark:text-[#aaa]">
                            <User size={18} />
                        </div>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#252525] rounded-xl shadow-xl border border-gray-200 dark:border-[#333] py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-[#333]">
                                <p className="text-xs text-gray-500 dark:text-[#888] font-medium uppercase tracking-wider mb-1">Signed in as</p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{username}</p>
                            </div>

                            <div className="py-1">
                                <button
                                    onClick={logout}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2 transition-colors"
                                >
                                    <LogOut size={16} />
                                    Sign out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
