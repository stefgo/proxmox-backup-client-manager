import { useEffect, useRef } from 'react';

interface ActionMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    children: React.ReactNode;
}

export const ActionMenu = ({ isOpen, onClose, position, children }: ActionMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <div
                ref={menuRef}
                className="fixed mt-2 w-48 bg-white dark:bg-[#1e1e1e] rounded-md shadow-lg border border-gray-200 dark:border-[#333] z-50 py-1"
                style={{
                    top: position.y,
                    left: position.x - 192 // Align right edge
                }}
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
            >
                {children}
            </div>
        </div>
    );
};
