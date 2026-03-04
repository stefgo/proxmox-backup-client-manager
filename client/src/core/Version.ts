import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Retrieves the current version of the client agent.
 */
export const getClientVersion = (): string => {
    try {
        // 1. Try VERSION file in current directory or parent (Docker/dist structure)
        const pathsToTry = [
            path.join(__dirname, "VERSION"),
            path.join(__dirname, "..", "VERSION"),
            path.resolve(process.cwd(), "VERSION"),
            path.resolve(process.cwd(), "dist", "VERSION"),
        ];

        for (const p of pathsToTry) {
            if (fs.existsSync(p)) {
                return fs.readFileSync(p, "utf8").trim();
            }
        }

        // 2. Fallback for development (Git)
        return execSync("git describe --tags --always --dirty")
            .toString()
            .trim();
    } catch (e) {
        return "unknown";
    }
};

export const VERSION = getClientVersion();
