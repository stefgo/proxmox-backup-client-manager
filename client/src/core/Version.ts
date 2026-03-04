import { execSync } from "child_process";

/**
 * Retrieves the current version of the client agent using Git.
 * Returns a tag, a commit hash, or 'unknown'.
 */
export const getClientVersion = (): string => {
    try {
        return execSync("git describe --tags --always --dirty")
            .toString()
            .trim();
    } catch (e) {
        return "unknown";
    }
};

export const VERSION = getClientVersion();
