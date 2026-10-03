import type { Archive } from '@pbcm/shared';

/**
 * What ArchiveSchema accepts, minus the dot (`.pxar` is appended): no spaces, and no
 * leading `-`, which the CLI would read as an option.
 */
export const sanitizeArchiveName = (name: string): string =>
    name.replace(/[^a-zA-Z0-9\-_]/g, '').replace(/^-+/, '');

/** The archive name a path suggests, for a name field the operator left empty. */
export const getDefaultNameFromPath = (path: string): string => {
    if (!path || path === '' || path === '.') return 'current';
    if (path === '/') return 'root';
    const basename = path.split('/').filter(Boolean).pop();
    return (basename && sanitizeArchiveName(basename)) || 'archive';
};

/**
 * The pattern that excludes `path` from the archive it lies in, or `null` if it lies
 * in none. The CLI reads an exclusion relative to the archive root, not to `/`, so a
 * path picked in the file browser has to be rebased -- `/home/stefan/.cache` in an
 * archive of `/home` is `/stefan/.cache`. The leading slash anchors it at the root, so
 * it does not also match a `.cache` further down. The deepest archive wins, which is
 * the one the path actually ends up in when archives are nested.
 */
export const excludePatternFromPath = (
    path: string,
    archives: readonly Pick<Archive, 'path'>[],
): string | null => {
    const clean = '/' + path.split('/').filter(Boolean).join('/');
    let best: string | null = null;
    for (const archive of archives) {
        const root = '/' + archive.path.split('/').filter(Boolean).join('/');
        const prefix = root === '/' ? '/' : root + '/';
        if (clean === root || !clean.startsWith(prefix)) continue;
        if (best === null || root.length > best.length) best = root;
    }
    if (best === null) return null;
    return best === '/' ? clean : clean.slice(best.length);
};

/** The directory above `path`, always absolute. The parent of `/` is `/`. */
export const parentPath = (path: string): string => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
};

/**
 * Where the file browser opens for an exclusion that is edited: the parent of the
 * directory an anchored, glob-free pattern names in the first archive, else that archive
 * itself. Only a guess to start browsing from -- the pattern itself is not touched by it.
 */
export const excludeBrowseStart = (pattern: string, archives: readonly Pick<Archive, 'path'>[]): string => {
    const fallback = archives[0]?.path || '/';
    if (!pattern.startsWith('/') || /[*?[\]]/.test(pattern)) return fallback;
    const root = '/' + (archives[0]?.path ?? '').split('/').filter(Boolean).join('/');
    return parentPath((root === '/' ? '' : root) + pattern);
};
