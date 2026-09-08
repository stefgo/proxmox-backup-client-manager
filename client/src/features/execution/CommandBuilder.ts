import { RestoreSnapshotPayload } from "@pbcm/shared";
import { config, requireClientId } from "../../core/Config.js";

/**
 * Turns a stored job configuration into the argument list for `proxmox-backup-client`.
 *
 * These two are the only part of a run with no I/O in them — no spawn, no database, no
 * socket. That makes them the first thing in the agent that can be checked without a
 * running process, which is the point of separating them out: an argument list is exactly
 * the kind of thing that is easy to get subtly wrong and hard to notice.
 *
 * Nothing here is passed through a shell. The Executor spawns with `shell: false`, so a
 * path or archive name containing spaces or quotes is one argument, not an injection.
 */

/** Where the encryption keyfile ends up, if the job has one. */
export interface KeyfileArgs {
    keyfilePath?: string;
}

/**
 * `proxmox-backup-client backup <name>.pxar:<path> … --backup-id <clientId>`
 *
 * `--backup-id` is this agent's own client id, never a chosen value: the same string is
 * the snapshot group in PBS, so the side that decides which client a snapshot belongs to
 * has to be the side that holds the identity.
 */
export function buildBackupArgs(
    jobConfigData: any,
    { keyfilePath }: KeyfileArgs = {},
): string[] {
    const args: string[] = [];

    if (keyfilePath) {
        args.push("--crypt-mode", "encrypt", "--keyfile", keyfilePath);
    }

    args.push("backup");

    const archives = jobConfigData.archives || [];
    if (Array.isArray(archives)) {
        for (const item of archives) {
            args.push(`${item.name}.pxar:${item.path}`);
        }
    }

    args.push("--backup-id", requireClientId());

    if (Array.isArray(config.backupParams)) {
        args.push(...config.backupParams);
    }

    return args;
}

/**
 * `proxmox-backup-client restore <snapshot> <archive> <targetPath>`
 *
 * Only the first archive: the CLI restores one at a time, and the UI offers a single
 * choice per run. Throws rather than defaulting when none is given — a restore without
 * an archive would otherwise reach the CLI as a malformed command line.
 */
export function buildRestoreArgs(
    payload: RestoreSnapshotPayload,
    { keyfilePath }: KeyfileArgs = {},
): string[] {
    const args: string[] = [];

    if (keyfilePath) {
        args.push("--keyfile", keyfilePath);
    }

    const archive = payload.archives?.[0];
    if (!archive) throw new Error("No archive specified for restore");

    args.push("restore");
    args.push(payload.snapshot);
    args.push(archive);
    args.push(payload.targetPath);

    if (Array.isArray(config.restoreParams)) {
        args.push(...config.restoreParams);
    }

    return args;
}
