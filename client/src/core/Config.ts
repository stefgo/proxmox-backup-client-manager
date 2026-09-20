import path from "path";
import fs from "fs";
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
    /**
     * The identity the server issued during registration, together with authToken.
     * Absent until then: an agent has no id of its own, because the id is also the PBS
     * `--backup-id` and the server is the side that decides which client that names.
     */
    clientId?: string;
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
    /**
     * Accept a PBCM server certificate that does not validate, for registration and for the
     * WebSocket alike. Off by default: that WebSocket carries the auth token, and a
     * certificate nobody checks is one anybody in between can present. The PBS certificate
     * is a different matter and handled by the fingerprint, not by this.
     */
    allowSelfSignedCertificates: boolean;
    logLevel: string;
    backupParams?: string[];
    restoreParams?: string[];
    queueDelaySeconds?: number;
    /**
     * Bytes of stdout and stderr kept per run, each channel counted separately.
     *
     * The captured output is held in memory for the whole run, stored as a BLOB and then
     * synced to the server, so an unbounded one costs three times over. Head and tail are
     * kept with the middle dropped — see core/CappedLog.ts.
     */
    logCapBytes: number;
    retentionTime: number;
    preScript?: string;
    postScript?: string;
    /**
     * Serve the agent's own web server over TLS. Absent means plain HTTP, which is what
     * every installation had before this existed.
     *
     * This is the other half of `allowSelfSignedCertificates`: that one is about the
     * certificate this agent checks when it dials the server, this one about the
     * certificate it presents when the server dials it.
     */
    tls?: AgentTlsConfig;
}

/**
 * Where the certificate and its private key are, for an agent that terminates TLS.
 * Held exactly as the operator wrote them -- see `readTlsMaterial`.
 */
export interface AgentTlsConfig {
    cert: string;
    key: string;
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

/**
 * The TLS block, or undefined when the agent serves plain HTTP.
 *
 * Every fault here is fatal rather than a warning, which is the opposite of how the
 * optional settings around it are read. An agent configured for TLS that fell back to
 * HTTP would serve `/ws/register` -- the route that hands it its auth token -- in the
 * clear, and would look exactly like a working agent while doing it. Refusing to start
 * names the wrong field while somebody is still watching the log.
 *
 * The files are read here rather than at listen(): a path that is wrong is wrong at
 * startup, not when the server first dials hours later. What is returned is what the
 * operator wrote, not the resolved path -- see `readTlsMaterial`.
 */
function resolveTls(fromFile: unknown): AgentTlsConfig | undefined {
    if (fromFile === undefined || fromFile === null) return undefined;

    const fail = (reason: string): never => {
        logger.fatal({ path: CONFIG_PATH }, `Invalid tls in config.yaml -- ${reason}`);
        process.exit(1);
    };

    if (typeof fromFile !== "object" || Array.isArray(fromFile)) {
        return fail("expected a block with cert and key");
    }

    const { cert, key } = fromFile as { cert?: unknown; key?: unknown };
    if (typeof cert !== "string" || cert.trim() === "") {
        return fail("cert must be the path to a certificate file");
    }
    if (typeof key !== "string" || key.trim() === "") {
        return fail("key must be the path to a private key file");
    }

    const tls: AgentTlsConfig = { cert: cert.trim(), key: key.trim() };
    for (const field of ["cert", "key"] as const) {
        const file = path.resolve(ROOT_DIR, tls[field]);
        try {
            fs.readFileSync(file);
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            return fail(`${field} cannot be read at ${file}${code ? ` (${code})` : ""}`);
        }
    }
    return tls;
}

/**
 * The certificate and key as Fastify wants them, or undefined for a plain HTTP agent.
 *
 * Read on demand instead of being kept in `config`: what is stored there is what the
 * operator wrote, and a resolved absolute path put back into config.yaml would silently
 * replace their relative one. Config.ts has already established that both files can be
 * read, so a throw here means they changed underneath a running agent.
 */
export function readTlsMaterial(): { cert: Buffer; key: Buffer } | undefined {
    if (!config.tls) return undefined;
    return {
        cert: fs.readFileSync(path.resolve(ROOT_DIR, config.tls.cert)),
        key: fs.readFileSync(path.resolve(ROOT_DIR, config.tls.key)),
    };
}

/**
 * config.yaml as it comes off the parser: everything optional, because the file is written
 * by hand. The fields a resolver or a typeof check validates below stay `unknown` -- naming
 * a type for them here would claim a check that happens further down.
 */
type LoadedConfig = {
    executable?: string;
    clientId?: unknown;
    authToken?: string;
    serverUrl?: string;
    logLevel?: string;
    backupParams?: unknown;
    restoreParams?: unknown;
    queueDelaySeconds?: unknown;
    logCapBytes?: unknown;
    retentionTime?: unknown;
    registrationSecret?: unknown;
    allowedNetworks?: unknown;
    allowSelfSignedCertificates?: unknown;
    listenPort?: unknown;
    tls?: unknown;
    tunnelAcquireJitterSeconds?: unknown;
    preScript?: unknown;
    postScript?: unknown;
};

// Global Document state to preserve comments
let configDoc: YAML.Document = new YAML.Document({});

// Default Config
export const config: ClientConfig = {
    executable: "proxmox-backup-client",
    tunnelAcquireJitterSeconds: 30,
    listenPort: parsePort(process.env.PBCM_CLIENT_PORT) ?? 3001,
    allowedNetworks: [],
    allowSelfSignedCertificates: false,
    logLevel: process.env.LOG_LEVEL || "info",
    backupParams: [],
    restoreParams: [],
    queueDelaySeconds: 5,
    logCapBytes: 256 * 1024,
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
    } catch {
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
        const loadedConfig = (configDoc.toJS() ?? {}) as LoadedConfig;

        if (loadedConfig.executable) {
            config.executable = loadedConfig.executable;
        }

        if (typeof loadedConfig.clientId === "string") {
            config.clientId = loadedConfig.clientId;
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

        // Floor rather than trust: a cap below a kilobyte would leave neither head nor
        // tail worth reading, and CappedLog raises it anyway.
        if (
            typeof loadedConfig.logCapBytes === "number" &&
            loadedConfig.logCapBytes >= 1024
        ) {
            config.logCapBytes = loadedConfig.logCapBytes;
        } else if (loadedConfig.logCapBytes !== undefined) {
            logger.warn(
                `Ignoring invalid logCapBytes in config.yaml, using ${config.logCapBytes}`,
            );
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

        if (typeof loadedConfig.allowSelfSignedCertificates === "boolean") {
            config.allowSelfSignedCertificates = loadedConfig.allowSelfSignedCertificates;
        } else if (
            loadedConfig.allowSelfSignedCertificates !== undefined &&
            loadedConfig.allowSelfSignedCertificates !== null
        ) {
            logger.warn(
                "Ignoring allowSelfSignedCertificates in config.yaml: expected true or false",
            );
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

        config.tls = resolveTls(loadedConfig.tls);

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
 * Stores the identity the server issued during registration. Both halves are written in
 * one go: every later connection is checked as a pair, so a config holding one without
 * the other could not connect and would have to be registered again anyway.
 */
export function persistIdentity(clientId: string, authToken: string): void {
    config.clientId = clientId;
    config.authToken = authToken;
    saveConfig();
}

/**
 * True once this agent has been registered. Both values are set together, so either one
 * answers the question -- checking both keeps a hand-edited config from getting halfway in.
 *
 * This is the gate for everything the agent does on its own: an unregistered client has no
 * identity to run under, so it runs nothing. See core/Lifecycle.ts.
 */
export function isRegistered(): boolean {
    return !!config.clientId && !!config.authToken;
}

/**
 * The client's id for the places that cannot proceed without one. Throws instead of
 * returning undefined: the callers are past the lifecycle gate, so a missing id there is a
 * bug -- and the one caller that matters builds the PBS `--backup-id`, where carrying on
 * without a value silently files the snapshot under the machine's hostname.
 */
export function requireClientId(): string {
    if (!config.clientId) {
        throw new Error(
            "This client has no identity. It has to be registered before it can run anything.",
        );
    }
    return config.clientId;
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
    return isRegistered() && !config.serverUrl;
}
