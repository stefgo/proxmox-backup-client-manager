import { useQuery } from '@tanstack/react-query';
import type { FsFile } from '@stefgo/react-ui-components';
import { FsFileListSchema } from '@pbcm/shared';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { getErrorMessage } from '../utils';

const NO_FILES: FsFile[] = [];

/** Directories first, then by name. */
const byKindThenName = (a: FsFile, b: FsFile) => {
    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
    return a.isDirectory ? -1 : 1;
};

/**
 * One directory of a client, listed live by its agent.
 *
 * The path is part of the key, so every answer belongs to the directory it was asked for:
 * directories are listed by the agent at its own pace, and a quick second click used to
 * let the slower first answer land last -- the header then named one directory and the
 * list showed another.
 *
 * Always stale, so a directory is listed again each time it is opened; one that was
 * listed before shows what it held until the new answer is there.
 */
export function useClientFiles(clientId: string | null | undefined, path: string) {
    const { data, isFetching, error } = useQuery({
        queryKey: queryKeys.clients.fs(clientId ?? '', path),
        queryFn: (): Promise<FsFile[]> =>
            api.get(`/api/v1/clients/${clientId}/fs?path=${encodeURIComponent(path)}`, FsFileListSchema, {
                fallback: 'Directory could not be listed',
            }),
        select: (files) => [...files].sort(byKindThenName),
        enabled: !!clientId,
        staleTime: 0,
    });

    return {
        // Emptied on failure, not kept: an old listing must not pass for the current one.
        fileList: error ? NO_FILES : (data ?? NO_FILES),
        isLoadingFiles: isFetching,
        error: error ? getErrorMessage(error) : null,
    };
}
