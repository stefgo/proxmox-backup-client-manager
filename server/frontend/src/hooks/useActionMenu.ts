import { useState, useCallback } from 'react';

interface MenuState<T = string | number> {
    id: T;
    x: number;
    y: number;
}

export const useActionMenu = <T = string | number>() => {
    const [menuState, setMenuState] = useState<MenuState<T> | null>(null);

    const openMenu = useCallback((e: React.MouseEvent, id: T) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setMenuState(current =>
            (current?.id === id) ? null : {
                id,
                x: rect.right,
                y: rect.bottom
            }
        );
    }, []);

    const closeMenu = useCallback(() => {
        setMenuState(null);
    }, []);

    return {
        menuState,
        openMenu,
        closeMenu
    };
};
