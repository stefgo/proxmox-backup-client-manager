interface StatCardProps {
    label: string;
    value: string;
    sub?: string;
    icon: React.ReactNode;
    onClick?: () => void;
}

export const StatCard = ({ label, value, sub, icon, onClick }: StatCardProps) => (
    <div
        onClick={onClick}
        className={`bg-white dark:bg-[#1e1e1e] p-6 rounded-xl border border-gray-200 dark:border-[#333] shadow-sm hover:shadow-md transition-all h-full ${onClick ? 'cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.98]' : ''}`}
    >
        <div className="flex justify-between items-start mb-4">
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-[#888] uppercase tracking-wide">{label}</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</h3>
            </div>
            <div className={`p-3 rounded-xl bg-gray-50 dark:bg-[#252525] text-gray-600 dark:text-[#888]`}>
                {icon}
            </div>
        </div>
        {sub && <div className="text-xs font-medium text-gray-400 dark:text-[#555]">{sub}</div>}
    </div>
);
