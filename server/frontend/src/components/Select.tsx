import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    fullWidth?: boolean;
    options: { value: string | number; label: string; disabled?: boolean }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
    label,
    error,
    fullWidth = true,
    options,
    className = '',
    ...props
}, ref) => {
    return (
        <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
            {label && (
                <label className="block text-xs font-bold text-gray-500 dark:text-[#888] uppercase mb-1.5 ml-1">
                    {label} {props.required && <span className="text-red-500">*</span>}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    className={`
                        block w-full bg-gray-50 dark:bg-[#111] border 
                        ${error ? 'border-red-500' : 'border-gray-200 dark:border-[#333]'} 
                        px-3 py-2.5 
                        rounded-lg text-gray-900 dark:text-white 
                        focus:outline-none focus:ring-2 focus:ring-[#E54D0D]/50 focus:border-[#E54D0D] 
                        transition-all sm:text-sm appearance-none
                    `}
                    {...props}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                {/* Custom arrow could go here */}
            </div>
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    );
});

Select.displayName = 'Select';
