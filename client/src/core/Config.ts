import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { Logger } from "./Logger.js";

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
    logLevel: string;
    backupParams?: string[];
    restoreParams?: string[];
    queueDelaySeconds?: number;
}

// Global Document state to preserve comments
let configDoc: YAML.Document = new YAML.Document({});

// Default Config
export const config: ClientConfig = {
    executable: "proxmox-backup-client",
    clientId: randomUUID(),
    logLevel: process.env.LOG_LEVEL || "info",
    backupParams: [],
    restoreParams: [],
    queueDelaySeconds: 5,
};

/**
 * Synchronizes the YAML document with the current config object
 * while preserving structure and comments.
 */
function syncDoc() {
    const configToSync = { ...config };
    delete configToSync.websocketURL; // Don't save dynamic prop

    for (const [key, value] of Object.entries(configToSync)) {
        configDoc.set(key, value);
    }
}

export function saveConfig(): void {
    try {
        syncDoc();
        fs.writeFileSync(CONFIG_PATH, configDoc.toString());
        Logger.info("Configuration saved securely with preserved comments.");
    } catch (e) {
        Logger.error("Failed to save config.yaml", e);
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

        if (!urlObj.pathname.endsWith("/ws")) {
            urlObj.pathname = path.join(urlObj.pathname, "ws");
        }
        config.websocketURL = urlObj.toString();
    } catch (e) {
        Logger.error("Failed to parse server URL for websocket: " + url);
    }
}

// Load Config
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileContent = fs.readFileSync(CONFIG_PATH, "utf-8");
        configDoc = YAML.parseDocument(fileContent);
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
            Logger.info("Using Server URL from config: " + config.serverUrl);
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
    } catch (e) {
        Logger.error("Failed to load config.yaml", e);
    }
} else {
    // If config file doesn't exist, use defaults
    Logger.info("No config.yaml found. Using defaults.");
}

Logger.setLevel(config.logLevel);
