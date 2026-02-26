import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: ReactNode;
    fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    icon,
    fullWidth = true,
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
                {icon && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                        {icon}
                    </div>
                )}
                <input
                    ref={ref}
                    className={`
                        block w-full bg-gray-50 dark:bg-[#111] border 
                        ${error ? 'border-red-500' : 'border-gray-200 dark:border-[#333]'} 
                        ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2.5 
                        rounded-lg text-gray-900 dark:text-white placeholder-gray-500 
                        focus:outline-none focus:ring-2 focus:ring-[#E54D0D]/50 focus:border-[#E54D0D] 
                        transition-all sm:text-sm
                    `}
                    {...props}
                />
            </div>
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
    );
});

Input.displayName = 'Input';
