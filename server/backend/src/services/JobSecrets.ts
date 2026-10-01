import type { BackupJob, Repository } from "@pbcm/shared";
import { RepositoryConfigRepository } from "../repositories/RepositoryConfigRepository.js";
import { ProxyService } from "./ProxyService.js";

/**
 * The two secrets a job carries -- the PBS token secret in its repository copy and the
 * encryption key -- are needed by the agent, which runs its jobs offline from its own
 * `jobs.json`, and by nobody else. They travel server -> agent only; every way a job
 * leaves the server towards a browser goes through redactJob(), and every way one comes
 * back goes through completeJobSecrets().
 *
 * The job cache in ProxyService keeps them: backfillRepositoryIds and the repository
 * distribution send whole jobs back to the agent from there.
 */

/**
 * A job as a browser may see it. `secret` stays as an empty string rather than going
 * missing, because RepositorySchema requires the field; `keyContent` is optional and is
 * dropped. `encryption.enabled` still says that the job has a key.
 */
export function redactJob(job: BackupJob): BackupJob {
    const redacted: BackupJob = { ...job };
    if (job.repository) {
        redacted.repository = { ...job.repository, secret: "" };
    }
    if (job.encryption) {
        redacted.encryption = { enabled: job.encryption.enabled };
    }
    return redacted;
}

/** The job as currently stored on the agent, refreshing a cold cache once. */
async function storedJob(
    clientId: string,
    jobId: string | null | undefined,
): Promise<BackupJob | undefined> {
    if (!jobId) return undefined;
    let job = ProxyService.getCachedJob(clientId, jobId);
    if (!job) {
        // Cold right after the agent connected -- the same fallback TunnelLease uses.
        await ProxyService.refreshJobCache(clientId);
        job = ProxyService.getCachedJob(clientId, jobId);
    }
    return job;
}

/** Whether two repository copies point at the same PBS login. */
function sameLogin(a: Repository, b: Repository): boolean {
    return (
        a.baseUrl === b.baseUrl &&
        a.datastore === b.datastore &&
        a.username === b.username &&
        (a.tokenname ?? "") === (b.tokenname ?? "")
    );
}

/**
 * Fills the secrets a browser cannot send back into a job about to be saved on the agent.
 *
 * - The repository secret comes from the managed repository the copy names. That is the
 *   authoritative value, so saving a job also brings it up to date with the repository.
 *   Without a managed repository (a job from before `repositoryId`), the job keeps the
 *   secret it already has -- but only for the same login, so a job pointed elsewhere
 *   never takes a secret that belongs to another PBS.
 * - An empty key with encryption on means "keep the stored key"; a new key is only ever
 *   sent right after it was generated.
 *
 * Done here and not on the agent, so it works with agents older than this change.
 */
export async function completeJobSecrets(
    clientId: string,
    job: Partial<BackupJob>,
): Promise<{ job: Partial<BackupJob> } | { error: string }> {
    const completed: Partial<BackupJob> = { ...job };
    // Fetched only when needed: it may cost a round trip to the agent.
    let stored: BackupJob | undefined;
    let storedLoaded = false;
    const loadStored = async () => {
        if (!storedLoaded) {
            stored = await storedJob(clientId, job.id);
            storedLoaded = true;
        }
        return stored;
    };

    if (job.repository) {
        let secret = "";
        if (job.repository.repositoryId) {
            try {
                secret =
                    RepositoryConfigRepository.findSecret(
                        job.repository.repositoryId,
                    ) ?? "";
            } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
            }
        }
        if (!secret) secret = job.repository.secret;
        if (!secret) {
            const previous = (await loadStored())?.repository;
            if (previous && sameLogin(previous, job.repository)) {
                secret = previous.secret;
            }
        }
        if (!secret) {
            return {
                error: "No secret is stored for this repository — select the repository again.",
            };
        }
        completed.repository = { ...job.repository, secret };
    }

    if (job.encryption?.enabled && !job.encryption.keyContent) {
        const keyContent = (await loadStored())?.encryption?.keyContent;
        if (!keyContent) {
            return {
                error: "Encryption is on, but no key is stored for this job — generate one.",
            };
        }
        completed.encryption = { enabled: true, keyContent };
    }

    return { job: completed };
}

/**
 * The repository a restore reads from, built from the managed repository rather than from
 * the request: the browser no longer has the secret, and the request only selects one of
 * the configured repositories. Undefined when the id names none.
 */
export function restoreRepository(repositoryId: string): Repository | undefined {
    const row = RepositoryConfigRepository.findById(repositoryId);
    if (!row?.base_url || !row.datastore || !row.username) return undefined;
    return {
        repositoryId: row.id,
        baseUrl: row.base_url,
        datastore: row.datastore,
        fingerprint: row.fingerprint ?? undefined,
        username: row.username,
        tokenname: row.tokenname ?? undefined,
        secret: RepositoryConfigRepository.findSecret(row.id) ?? "",
    };
}
