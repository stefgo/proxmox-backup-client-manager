import { create } from "zustand";
import { FsFile } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../utils";
import { apiFetch } from "../lib/apiFetch";

interface ClientFileSystemState {
    fileList: FsFile[];
    isLoadingFiles: boolean;
    error: string | null;

    fetchFileList: (
        clientId: string,
        path: string,
    ) => Promise<void>;
}

export const useClientFileSystemStore = create<ClientFileSystemState>(
    (set) => ({
        fileList: [],
        isLoadingFiles: false,
        error: null,

        fetchFileList: async (clientId, path) => {
            set({ isLoadingFiles: true, error: null });
            try {
                const res = await apiFetch(
                    `/api/v1/clients/${clientId}/fs?path=${encodeURIComponent(path)}`,
                    {
                    },
                );
                if (res.ok) {
                    const files = await res.json();
                    set({
                        fileList: files.sort((a: FsFile, b: FsFile) => {
                            if (a.isDirectory === b.isDirectory)
                                return a.name.localeCompare(b.name);
                            return a.isDirectory ? -1 : 1;
                        }),
                    });
                } else {
                    const err = await res.json();
                    set({ error: err.error });
                }
            } catch (e: unknown) {
                set({ error: getErrorMessage(e) });
            } finally {
                set({ isLoadingFiles: false });
            }
        },
    }),
);
