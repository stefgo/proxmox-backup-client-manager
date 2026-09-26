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

/**
 * The request whose answer the store is waiting for. Only that one is allowed to write:
 * directories are listed by the agent at its own pace, and a quick second click used to
 * let the slower first answer land last -- the header then named one directory and the
 * list showed another.
 */
let latestRequest = 0;

export const useClientFileSystemStore = create<ClientFileSystemState>(
    (set) => ({
        fileList: [],
        isLoadingFiles: false,
        error: null,

        fetchFileList: async (clientId, path) => {
            const request = ++latestRequest;
            set({ isLoadingFiles: true, error: null });
            try {
                const res = await apiFetch(
                    `/api/v1/clients/${clientId}/fs?path=${encodeURIComponent(path)}`,
                    {
                    },
                );
                const body = await res.json().catch(() => null);
                if (request !== latestRequest) return;
                if (res.ok && Array.isArray(body)) {
                    set({
                        fileList: body.sort((a: FsFile, b: FsFile) => {
                            if (a.isDirectory === b.isDirectory)
                                return a.name.localeCompare(b.name);
                            return a.isDirectory ? -1 : 1;
                        }),
                    });
                } else {
                    // Emptied, not kept: the old listing belongs to a different directory
                    // than the one the browser now names.
                    set({
                        fileList: [],
                        error: body?.error || res.statusText || "Directory could not be listed",
                    });
                }
            } catch (e: unknown) {
                if (request !== latestRequest) return;
                set({ fileList: [], error: getErrorMessage(e) });
            } finally {
                if (request === latestRequest) set({ isLoadingFiles: false });
            }
        },
    }),
);
