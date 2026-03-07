import { create } from 'zustand';
import { FsFile } from '@pbcm/shared';

interface ClientFileSystemState {
    fileList: FsFile[];
    isLoadingFiles: boolean;
    error: string | null;

    fetchFileList: (clientId: string, path: string, token: string) => Promise<void>;
}

export const useClientFileSystemStore = create<ClientFileSystemState>((set) => ({
    fileList: [],
    isLoadingFiles: false,
    error: null,

    fetchFileList: async (clientId, path, token) => {
        set({ isLoadingFiles: true, error: null });
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/fs?path=${encodeURIComponent(path)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const files = await res.json();
                set({
                    fileList: files.sort((a: FsFile, b: FsFile) => {
                        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                        return a.isDirectory ? -1 : 1;
                    })
                });
            } else {
                 const err = await res.json();
                 set({ error: err.error });
            }
        } catch (e: unknown) {
             set({ error: e.message });
        } finally {
            set({ isLoadingFiles: false });
        }
    },
}));
