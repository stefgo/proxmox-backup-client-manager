import { REPOSITORY_STATUS } from "@pbcm/shared";
import {
    RepositoryConfigRepository,
    type RepositoryRow,
} from "../repositories/RepositoryConfigRepository.js";

export type RepositoryReachability = typeof REPOSITORY_STATUS.ONLINE | typeof REPOSITORY_STATUS.OFFLINE;

/** How long a check is worth to the status report: as long as the dashboard keeps one. */
const CACHE_MS = 30_000;

/** How long a repository may take to answer before it counts as not answering. */
const TIMEOUT_MS = 5000;

/**
 * The Authorization header for the PBS API. The secret is decrypted here, for this one
 * request, and nowhere else.
 */
export function pbsAuthHeader(repo: RepositoryRow): string {
    const secret = RepositoryConfigRepository.findSecret(repo.id) ?? "";
    return `PBSAPIToken ${repo.username}!${repo.tokenname || "token"}:${secret}`;
}

/**
 * Whether a repository answers: its datastore's status, asked of the Proxmox Backup Server
 * itself. Nothing keeps this as state -- it is asked.
 */
export class RepositoryStatusService {
    private static readonly cache = new Map<string, { status: RepositoryReachability; at: number }>();
    private static readonly inFlight = new Map<string, Promise<RepositoryReachability>>();

    /**
     * Asks the repository now. One whose record is incomplete, that answers with an error or
     * not within five seconds counts as offline.
     */
    static async check(repo: RepositoryRow): Promise<RepositoryReachability> {
        if (!repo.base_url || !repo.datastore) return REPOSITORY_STATUS.OFFLINE;
        const baseUrl = repo.base_url.endsWith("/") ? repo.base_url.slice(0, -1) : repo.base_url;
        const url = `${baseUrl}/api2/json/admin/datastore/${repo.datastore}/status`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                headers: { Authorization: pbsAuthHeader(repo) },
                signal: controller.signal,
            });
            return res.ok ? REPOSITORY_STATUS.ONLINE : REPOSITORY_STATUS.OFFLINE;
        } catch {
            return REPOSITORY_STATUS.OFFLINE;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * What the status report reads: the last check while it is younger than 30 seconds,
     * otherwise a new one -- and one at a time per repository, so readers that ask together
     * share it. The dashboard asks through `check`, uncached, as before.
     */
    static async cached(repo: RepositoryRow, now = Date.now()): Promise<RepositoryReachability> {
        const known = this.cache.get(repo.id);
        if (known && now - known.at < CACHE_MS) return known.status;
        const running = this.inFlight.get(repo.id);
        if (running) return running;
        const probe = this.check(repo)
            .then((status) => {
                this.cache.set(repo.id, { status, at: Date.now() });
                return status;
            })
            .finally(() => this.inFlight.delete(repo.id));
        this.inFlight.set(repo.id, probe);
        return probe;
    }

    /** Forgets every cached check; for tests. */
    static reset(): void {
        this.cache.clear();
        this.inFlight.clear();
    }
}
