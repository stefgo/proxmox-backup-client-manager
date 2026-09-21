import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "@pbcm/shared/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");

/**
 * Where the agent keeps what it has to survive a restart -- its jobs, their schedule state
 * and the history of their runs.
 *
 * Deliberately *not* next to `config.yaml`. In a container that file is a single bind mount,
 * so anything written beside it lands in the container's own filesystem and is gone with the
 * next recreate. This directory is a named volume
 * (`compose.yaml`), and `PBCM_CLIENT_DATA_DIR` moves it for an agent that runs outside one.
 *
 * Unlike kasm and dim, not everything here is scratch state. `jobs.json` is the only copy of
 * the job configuration there is -- the server passes it through, it does not keep it -- which
 * is why this module syncs what it writes and sets a damaged file aside instead of letting
 * the next write replace it.
 */
export const DATA_DIR =
    process.env.PBCM_CLIENT_DATA_DIR?.trim() || path.resolve(ROOT_DIR, "data");

/**
 * Creates DATA_DIR at startup. Writes create it on demand, but a fresh agent writes nothing
 * until it is registered, and the health check answers for a directory it can write to --
 * so without this a new installation reports itself unhealthy. Throws when the directory
 * cannot be created: an agent that cannot keep its jobs should not come up.
 *
 * Mode 0700, and set again on an existing directory: `jobs.json` holds the PBS encryption
 * keys and the repository secrets in plain text. Tightening the directory protects files an
 * older agent wrote world-readable at once, not only after their next write.
 */
export function ensureDataDir(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    try {
        fs.chmodSync(DATA_DIR, 0o700);
    } catch (err) {
        logger.warn(
            { err, dir: DATA_DIR },
            "Could not restrict the data directory to the agent; it holds encryption keys",
        );
    }
}

/** A name relative to DATA_DIR, e.g. `jobs.json` or `history/<id>.json`. */
export function pathOf(name: string): string {
    return path.join(DATA_DIR, name);
}

/**
 * Moves a file out of the way under a name nobody writes to, so its content is still there
 * for the operator to look at. Answers the new path, or null if not even that worked.
 */
export function quarantineFile(name: string): string | null {
    const file = pathOf(name);
    const target = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
        fs.renameSync(file, target);
        return target;
    } catch (err) {
        logger.error({ err, file }, "Could not set a damaged data file aside");
        return null;
    }
}

/**
 * Reads one file as JSON. A file that is missing, unreadable or not JSON answers `null`.
 * The caller validates the shape; this only guarantees it is JSON.
 *
 * For scratch state that is the right answer: an agent that will not come up because of its
 * own scratch file is the worse failure. For a file that is the only copy of something,
 * `quarantine` sets a damaged one aside first -- a `null` would otherwise read as "nothing
 * stored yet", and the next write would replace what was there for good.
 */
export function readJsonFile(
    name: string,
    options: { quarantine?: boolean } = {},
): unknown | null {
    const file = pathOf(name);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (err) {
        if (options.quarantine) {
            const movedTo = quarantineFile(name);
            logger.error(
                { err, file, movedTo },
                "A data file could not be read and was set aside. Its content is not in use.",
            );
        } else {
            logger.warn({ err, file }, "Discarding an unreadable data file");
        }
        return null;
    }
}

/** fsync on a directory, so a rename inside it is on disk and not just in the page cache. */
function syncDirectory(dir: string): void {
    let fd: number | null = null;
    try {
        fd = fs.openSync(dir, "r");
        fs.fsyncSync(fd);
    } catch {
        // Not every platform lets a directory be opened for this; the rename has happened
        // either way, and this only narrows the window in which a power cut could undo it.
    } finally {
        if (fd !== null) fs.closeSync(fd);
    }
}

/**
 * Writes one file as JSON, atomically: a temporary file next to the target, synced, then a
 * rename, then the directory synced. A plain write that is cut short -- the host losing
 * power mid-update -- would leave half a file behind, and rename is the one operation the
 * filesystem gives us that cannot. The syncs make the rename carry the new content rather
 * than an empty file on a filesystem that reorders the two.
 *
 * Answers whether it worked. Callers whose loss is cheap ignore that; the ones that hold the
 * only copy of something log it where somebody will look.
 *
 * Every file is 0600, since `jobs.json` carries keys and secrets. The mode is set explicitly
 * as well as on open: open only applies it when it creates the file, and a `.tmp` left
 * behind by a crash would otherwise keep whatever mode it had.
 */
export function writeJsonFile(name: string, value: unknown): boolean {
    const file = pathOf(name);
    const dir = path.dirname(file);
    const temp = `${file}.tmp`;
    let fd: number | null = null;
    try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fd = fs.openSync(temp, "w", 0o600);
        fs.fchmodSync(fd, 0o600);
        fs.writeFileSync(fd, JSON.stringify(value, null, 4));
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        fs.renameSync(temp, file);
        syncDirectory(dir);
        return true;
    } catch (err) {
        logger.error({ err, file }, "Failed to write a data file");
        try {
            if (fd !== null) fs.closeSync(fd);
            fs.rmSync(temp, { force: true });
        } catch {
            // Nothing left to do about it; the next write overwrites the leftover.
        }
        return false;
    }
}

/** Deletes one file. A file that is already gone counts as deleted. */
export function removeJsonFile(name: string): boolean {
    try {
        fs.rmSync(pathOf(name), { force: true });
        return true;
    } catch (err) {
        logger.error({ err, file: pathOf(name) }, "Failed to delete a data file");
        return false;
    }
}

/**
 * The `.json` files directly inside a subdirectory, as names relative to DATA_DIR. A
 * directory that does not exist yet is empty. Leftover `.tmp` files and set-aside
 * `.corrupt-…` files are not listed.
 */
export function listJsonFiles(subdir: string): string[] {
    const dir = pathOf(subdir);
    try {
        return fs
            .readdirSync(dir)
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => path.join(subdir, entry));
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
    }
}
