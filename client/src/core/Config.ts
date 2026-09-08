import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { logger } from "@pbcm/shared/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../");

// Paths
export const CONFIG_PATH = path.resolve(ROOT_DIR, "config.yaml");

export interface ClientConfig {
    serverUrl?: string;
    websocketURL?: string;
    executable: string;
    clientId: string;
    authToken?: string;
    /**
     * One-time secret for outbound mode: the server dials this agent and registers
     * itself with it. Consumed on first successful registration.
     */
    registrationSecret?: string;
    /**
     * Random delay before requesting a tunnel lease. Clients usually share the same
     * schedule ("daily at 02:00") and would otherwise all ask in the same second.
     */
    tunnelAcquireJitterSeconds?: number;
    /**
     * TCP port for the local Web UI and — in outbound mode — for the /ws/register and
     * /ws/agent endpoints the server dials. Must match the port in the client's
     * "Zieladresse" on the server side.
     */
    listenPort: number;
    /**
     * Networks the server may dial this agent from -- outbound mode only, where the two
     * endpoints below are reachable for anyone who can route to `listenPort`. Empty means
     * no restriction, as on the server side.
     *
     * Deliberately not applied to the local Web UI on the same port: that is the surface
     * an operator uses to set the registration secret, and a list holding only the
     * server's address would shut them out of it.
     */
    allowedNetworks?: string[];
    logLevel: string;
    backupParams?: string[];
    restoreParams?: string[];
    queueDelaySeconds?: number;
    retentionTime: number;
    preScript?: string;
    postScript?: string;
}

/**
 * Accepts a port from YAML (number) or an environment variable (string) and rejects
 * anything outside the valid TCP range, so a typo falls back to the default instead of
 * making fastify.listen throw at startup.
 */
function parsePort(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
    return port;
}

// Global Document state to preserve comments
let configDoc: YAML.Document = new YAML.Document({});

// Default Config
export const config: ClientConfig = {
    executable: "proxmox-backup-client",
    clientId: randomUUID(),
    tunnelAcquireJitterSeconds: 30,
    listenPort: parsePort(process.env.PBCM_CLIENT_PORT) ?? 3001,
    allowedNetworks: [],
    logLevel: process.env.LOG_LEVEL || "info",
    backupParams: [],
    restoreParams: [],
    queueDelaySeconds: 5,
    retentionTime: 90,
    preScript: undefined,
    postScript: undefined,
};

/**
 * Synchronizes the YAML document with the current config object
 * while preserving structure and comments.
 */
function syncDoc() {
    const configToSync = { ...config };
    delete configToSync.websocketURL; // Don't save dynamic prop

    for (const [key, value] of Object.entries(configToSync)) {
        // Skip cleared values (e.g. a consumed registrationSecret) so they are not
        // written back as explicit nulls.
        if (value === undefined) {
            configDoc.delete(key);
            continue;
        }
        configDoc.set(key, value);
    }
}

export function saveConfig(): void {
    try {
        syncDoc();
        fs.writeFileSync(CONFIG_PATH, configDoc.toString());
        logger.info("Configuration saved securely with preserved comments.");
    } catch (e) {
        logger.error({ err: e }, "Failed to save config.yaml");
    }
}

export function setServerUrl(url: string) {
    config.serverUrl = url;
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol === "http:") {
            urlObj.protocol = "ws:";
        } else if (urlObj.protocol === "https:") {
            urlObj.protocol = "wss:";
        }

        if (!urlObj.pathname.endsWith("/ws/agent")) {
            urlObj.pathname = path.join(urlObj.pathname, "ws/agent");
        }
        config.websocketURL = urlObj.toString();
    } catch (e) {
        logger.error("Failed to parse server URL for websocket: " + url);
    }
}

// Load Config
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileContent = fs.readFileSync(CONFIG_PATH, "utf-8");
        configDoc = YAML.parseDocument(fileContent);
        // Stays `any`: this is an operator-edited file whose contents are unknown by
        // definition, and every field below is read defensively one at a time. A declared
        // shape here would assert a structure the file is under no obligation to have.
        const loadedConfig = configDoc.toJS() as any;

        if (loadedConfig.executable) {
            config.executable = loadedConfig.executable;
        }

        if (loadedConfig.clientId) {
            config.clientId = loadedConfig.clientId;
        } else {
            // Save generated ID if not present in file
            config.clientId = config.clientId; // Keep default
            saveConfig();
        }

        if (loadedConfig.authToken) {
            config.authToken = loadedConfig.authToken;
        }

        if (loadedConfig.serverUrl) {
            setServerUrl(loadedConfig.serverUrl);
            logger.info("Using Server URL from config: " + config.serverUrl);
        }

        if (loadedConfig.logLevel) {
            config.logLevel = loadedConfig.logLevel;
        }

        if (Array.isArray(loadedConfig.backupParams)) {
            config.backupParams = loadedConfig.backupParams;
        }

        if (Array.isArray(loadedConfig.restoreParams)) {
            config.restoreParams = loadedConfig.restoreParams;
        }

        if (typeof loadedConfig.queueDelaySeconds === "number") {
            config.queueDelaySeconds = loadedConfig.queueDelaySeconds;
        }

        if (typeof loadedConfig.retentionTime === "number") {
            config.retentionTime = loadedConfig.retentionTime;
        }

        if (typeof loadedConfig.registrationSecret === "string") {
            config.registrationSecret = loadedConfig.registrationSecret;
        }

        if (Array.isArray(loadedConfig.allowedNetworks)) {
            config.allowedNetworks = loadedConfig.allowedNetworks;
        }

        // The environment variable wins: in a container it is set without touching the
        // mounted config.yaml, which would otherwise have to differ per host.
        if (process.env.PBCM_CLIENT_PORT === undefined) {
            const port = parsePort(loadedConfig.listenPort);
            if (port !== undefined) {
                config.listenPort = port;
            } else if (loadedConfig.listenPort !== undefined) {
                logger.warn(
                    "Ignoring invalid listenPort in config.yaml, using " +
                        config.listenPort,
                );
            }
        }

        if (typeof loadedConfig.tunnelAcquireJitterSeconds === "number") {
            config.tunnelAcquireJitterSeconds =
                loadedConfig.tunnelAcquireJitterSeconds;
        }

        if (typeof loadedConfig.preScript === "string") {
            config.preScript = loadedConfig.preScript;
        }

        if (typeof loadedConfig.postScript === "string") {
            config.postScript = loadedConfig.postScript;
        }
    } catch (e) {
        logger.error({ err: e }, "Failed to load config.yaml");
    }
} else {
    // If config file doesn't exist, use defaults
    logger.info("No config.yaml found. Using defaults.");
}

logger.level = config.logLevel;

/**
 * Stores the auth token the server generated during outbound registration.
 */
export function persistAuthToken(authToken: string): void {
    config.authToken = authToken;
    saveConfig();
}

/**
 * Removes the registration secret after it has been used — it is single use, and a
 * leftover secret would allow a second party to register against this agent.
 */
export function deleteRegistrationSecret(): void {
    config.registrationSecret = undefined;
    try {
        configDoc.delete("registrationSecret");
        fs.writeFileSync(CONFIG_PATH, configDoc.toString());
    } catch (e) {
        logger.error({ err: e }, "Failed to remove registrationSecret from config.yaml");
    }
}

/**
 * True when this agent is operated in outbound mode: the server dials it, so it must
 * host the agent endpoints instead of connecting out.
 */
export function isOutboundMode(): boolean {
    if (config.registrationSecret) return true;
    return !!config.authToken && !config.serverUrl;
}
