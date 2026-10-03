import { useMemo } from 'react';
import { queryOptions, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CertificateCheckSchema,
    DistributeResultSchema,
    ManagedRepositoryListSchema,
    REPOSITORY_STATUS,
    RepositoryStatusResponseSchema,
    SnapshotListSchema,
    type ManagedRepository as Repository,
    type RepositoryInput,
} from '@pbcm/shared';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

type RepositoryId = Repository['id'];

/** One identity for "nothing yet", so a pending list does not hand out a new array per render. */
const NO_REPOSITORIES: Repository[] = [];

const repositoryListOptions = queryOptions({
    queryKey: queryKeys.repositories.list(),
    queryFn: () =>
        api.get('/api/v1/repositories', ManagedRepositoryListSchema, {
            fallback: 'Failed to fetch repositories',
        }),
});

/**
 * Whether the PBS behind a repository answers. An entry of its own, not a field written
 * into the list: the server is asked once per repository, and when each answer replaced
 * the list, everything that depended on the list ran again once per repository.
 */
const repositoryStatusOptions = (id: RepositoryId) =>
    queryOptions({
        queryKey: queryKeys.repositories.status(id),
        queryFn: async () =>
            (await api.get(`/api/v1/repositories/${id}/status`, RepositoryStatusResponseSchema)).status,
    });

/** A repository's snapshots, newest first. Shared by the repository page and the client page. */
export const repositorySnapshotsOptions = (id: RepositoryId) =>
    queryOptions({
        queryKey: queryKeys.repositories.snapshots(id),
        queryFn: () =>
            api.get(`/api/v1/repositories/${id}/snapshots`, SnapshotListSchema, {
                fallback: 'Failed to fetch snapshots',
            }),
        select: (snapshots) => [...snapshots].sort((a, b) => b.backupTime - a.backupTime),
    });

/**
 * The repositories, each with the status the server last measured for it: `loading` until
 * the first answer, `offline` when the check itself failed -- a refusal and an unreachable
 * server read the same here.
 *
 * `isPending` is true until the list has answered once, also with an error. An empty list
 * before that says nothing about whether a repository exists.
 */
export function useRepositories() {
    const { data = NO_REPOSITORIES, isPending, error, refetch } = useQuery(repositoryListOptions);

    const statuses = useQueries({
        queries: data.map((repo) => repositoryStatusOptions(repo.id)),
        combine: (results) =>
            results.map((result) => {
                if (result.data) return result.data;
                return result.isError ? REPOSITORY_STATUS.OFFLINE : REPOSITORY_STATUS.LOADING;
            }),
    });

    const repositories = useMemo(
        () => data.map((repo, i) => ({ ...repo, status: statuses[i] ?? REPOSITORY_STATUS.LOADING })),
        [data, statuses],
    );

    return { repositories, isPending, error, refetch };
}

export function useRepositorySnapshots(id: RepositoryId) {
    return useQuery(repositorySnapshotsOptions(id));
}

/**
 * Adding and changing read everything below `repositories` again: a new address or secret
 * changes what the status check and the snapshot list answer, not only the row.
 */
export function useAddRepository() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (repo: RepositoryInput) =>
            api.post('/api/v1/repositories', repo, undefined, { fallback: 'Failed to add repository' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.repositories.all }),
    });
}

export function useUpdateRepository() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, repo }: { id: RepositoryId; repo: RepositoryInput }) =>
            api.put(`/api/v1/repositories/${id}`, repo, undefined, { fallback: 'Failed to update repository' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.repositories.all }),
    });
}

export function useDeleteRepository() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: RepositoryId) =>
            api.delete(`/api/v1/repositories/${id}`, { fallback: 'Failed to delete repository' }),
        // Removed once the server confirmed it, not before: nothing to roll back.
        onSuccess: (_, id) => {
            queryClient.setQueryData(repositoryListOptions.queryKey, (list) =>
                list?.filter((r) => r.id !== id),
            );
            queryClient.removeQueries({ queryKey: queryKeys.repositories.status(id) });
            queryClient.removeQueries({ queryKey: queryKeys.repositories.snapshots(id) });
        },
    });
}

/**
 * Asked on request and shown where it was asked: the editor holds the answer for as long
 * as it is open. Not cached -- a certificate is measured now or not at all.
 */
export const probeCertificate = (id: RepositoryId) =>
    api.get(`/api/v1/repositories/${id}/certificate`, CertificateCheckSchema, {
        fallback: 'Certificate check failed',
    });

/** Pushes the stored fingerprint and secret to the jobs on connected clients. */
export const distributeRepository = (id: RepositoryId) =>
    api.post(`/api/v1/repositories/${id}/distribute`, undefined, DistributeResultSchema, {
        fallback: 'Distribution failed',
    });
