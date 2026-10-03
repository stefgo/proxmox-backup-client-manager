import { create } from 'zustand';
import { FsFile } from '@stefgo/react-ui-components';
import { FsFileListSchema } from '@pbcm/shared';
import { getErrorMessage } from '../utils';
import { api } from '../lib/api';

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
                const files = await api.get(
                    `/api/v1/clients/${clientId}/fs?path=${encodeURIComponent(path)}`,
                    FsFileListSchema,
                    { fallback: 'Directory could not be listed' },
                );
                if (request !== latestRequest) return;
                set({
                    fileList: files.sort((a, b) => {
                        if (a.isDirectory === b.isDirectory)
                            return a.name.localeCompare(b.name);
                        return a.isDirectory ? -1 : 1;
                    }),
                });
            } catch (e: unknown) {
                if (request !== latestRequest) return;
                // Emptied, not kept: the old listing belongs to a different directory
                // than the one the browser now names.
                set({ fileList: [], error: getErrorMessage(e) });
            } finally {
                if (request === latestRequest) set({ isLoadingFiles: false });
            }
        },
    }),
);
