import fs from "fs";
import path from "path";
import os from "os";
import { WS_EVENTS, normalizeFingerprint } from "@pbcm/shared";
import { logger, probeCertificate } from "@pbcm/shared/node";
import { JobRepository } from "../../repositories/JobRepository.js";
import { Connection } from "../../core/Connection.js";
import { TunnelClient } from "../TunnelClient.js";

/** Re-exported under its own name so callers here do not reach into TunnelClient. */
const buildRepositoryValue = (repo: any) =>
    TunnelClient.buildRepositoryValue(repo);

/**
 * What a run needs in place before `proxmox-backup-client` is spawned.
 *
 * Backup and restore prepared these separately, each with its own copy of the keyfile
 * handling and the repository environment. That is the arrangement in which the keyfile
 * cleanup already went missing once — the comment on `runProxmoxClient` records it.
 */

/**
 * Writes the PBS encryption key to a temporary file and returns its path.
 *
 * Mode 0600: the file holds the key in plaintext for the length of the run. The caller is
 * responsible for removing it on every exit path — see `removeTempKeyfile`.
 */
export function writeTempKeyfile(
    runId: string,
    keyContent: string,
    prefix = "pbcm_key",
): string {
    const keyfilePath = path.join(os.tmpdir(), `${prefix}_${runId}.json`);
    fs.writeFileSync(keyfilePath, keyContent, { mode: 0o600 });
    return keyfilePath;
}

/**
 * Points `proxmox-backup-client` at the repository and returns the password the caller
 * has to feed into file descriptor 3.
 *
 * Identical for backup and restore, and previously written out in both. The password
 * travels through a pipe rather than the command line, where it would be readable in the
 * process table of the machine being backed up.
 *
 * A tunnelled run keeps the stored fingerprint: it reaches the PBS as 127.0.0.1, where a
 * CA check can never succeed, so the server measures instead and hands the value over
 * with the lease.
 */
export async function applyRepositoryEnv(
    env: NodeJS.ProcessEnv,
    repo: any,
    opts: { tunnelRequired: boolean; jobId?: string },
): Promise<string | undefined> {
    env.PBS_REPOSITORY = buildRepositoryValue(repo);
    env.PBS_PASSWORD_FD = "3";

    const fingerprint = opts.tunnelRequired
        ? repo.fingerprint
        : await resolveFingerprint(repo, opts.jobId);

    if (fingerprint) {
        env.PBS_FINGERPRINT = fingerprint;
    }

    return repo.secret;
}

/**
 * Removes the temporary keyfile written for a run. The file holds the PBS
 * encryption key in plaintext, so it has to be dropped on every exit path --
 * success, failure and early abort alike.
 */
export function removeTempKeyfile(keyfilePath: string | undefined): void {
    if (!keyfilePath) return;
    try {
        fs.rmSync(keyfilePath, { force: true });
    } catch (e) {
        logger.error({ err: e, keyfilePath }, "Failed to delete temp keyfile");
    }
}

/**
 * Determines which fingerprint to pin for a direct run.
 *
 * The stored value is a copy that ages: it is written when the job is saved and
 * nothing updates it when the PBS renews its certificate. Measuring here keeps the
 * client working on its own, including while the server is unreachable.
 *
 * A measured value is only adopted when regular CA validation vouched for it. That
 * check is the whole point — it is evidence from a source independent of the
 * fingerprint itself. Without it (a self-signed PBS) adopting whatever the peer
 * presents would turn the pin into a rubber stamp, so the stored value stands and a
 * genuine mismatch is left to fail the run, which is exactly what pinning is for.
 */
export async function resolveFingerprint(
    repo: any,
    jobId?: string,
): Promise<string | undefined> {
    if (!repo?.baseUrl) return repo?.fingerprint;

    const probe = await probeCertificate(repo.baseUrl);
    if (!probe.reachable || !probe.fingerprint) return repo.fingerprint;

    const stored = normalizeFingerprint(repo.fingerprint);
    if (stored === probe.fingerprint) return repo.fingerprint;

    // Worth telling the server about either way: with a valid chain it is a renewal
    // the stored value has not caught up with, without one it may be worse.
    Connection.send(WS_EVENTS.FINGERPRINT_OBSERVED, {
        repositoryId: repo.repositoryId,
        baseUrl: repo.baseUrl,
        fingerprint: probe.fingerprint,
        caValid: probe.caValid,
    });

    if (!probe.caValid) {
        logger.warn(
            { baseUrl: repo.baseUrl, measured: probe.fingerprint },
            "Certificate differs from the pinned fingerprint and could not be validated — keeping the stored value",
        );
        return repo.fingerprint;
    }

    logger.info(
        { baseUrl: repo.baseUrl, measured: probe.fingerprint },
        "Certificate was renewed and validates against a trusted CA — adopting the new fingerprint",
    );

    if (jobId) persistFingerprint(jobId, probe.fingerprint);
    return probe.fingerprint;
}

/** Writes an adopted fingerprint back so the next offline run has it too. */
export function persistFingerprint(jobId: string, fingerprint: string): void {
    try {
        const row = JobRepository.findById(jobId);
        if (!row?.config) return;

        const parsed = JSON.parse(row.config as string);
        if (!parsed.repository) return;

        parsed.repository.fingerprint = fingerprint;
        JobRepository.updateConfig(jobId, JSON.stringify(parsed));
    } catch (e) {
        logger.warn(
            { err: e, jobId },
            "Failed to persist the updated fingerprint",
        );
    }
}
