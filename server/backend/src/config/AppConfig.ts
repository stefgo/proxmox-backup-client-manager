import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as client from "openid-client";
import YAML from "yaml";
import { logger } from "@pbcm/shared/node";
import {
    AppConfigSchema,
    TunnelSettingsSchema,
    type AppConfigParsed,
} from "@pbcm/shared";
import { firstIssue } from "../utils/validation.js";

import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../../../config.yaml");

/**
 * The shape of config.yaml, derived from the schema in `shared` rather than declared
 * twice. The schema is the single definition of what a valid configuration is; this alias
 * exists so the rest of the backend keeps importing a name instead of a Zod type.
 *
 * Note the top level and `settings` stay loose (see AppConfigSchema): unknown keys carry
 * an operator's own additions, and saveConfig() writes this object back into the file.
 */
export type AppConfig = AppConfigParsed;
export type TunnelSettings = AppConfigParsed["tunnel"];

const DEFAULT_TUNNEL: TunnelSettings = TunnelSettingsSchema.parse({});

let configDoc: YAML.Document = new YAML.Document({});
let config: Partial<AppConfig> = {};

/**
 * Reads config.yaml as it stands, without filling anything in.
 *
 * Merging defaults used to happen here, by hand, per block. That now belongs to
 * AppConfigSchema — but it cannot run yet: the two secrets below are generated on first
 * start, and validating before that would reject every fresh installation.
 */
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const fileContent = fs.readFileSync(CONFIG_PATH, "utf-8");
            configDoc = YAML.parseDocument(fileContent);
            config = (configDoc.toJS() ?? {}) as Partial<AppConfig>;
        } catch (e) {
            logger.error({ err: e }, "Failed to load config.yaml");
        }
    }
}

/**
 * Synchronizes the YAML document with the current config object
 * while preserving structure and comments.
 */
function syncDoc() {
    if (!configDoc.contents) {
        configDoc.contents = configDoc.createNode({});
    }

    const updateRecursive = (path: string[], value: any) => {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            for (const [key, val] of Object.entries(value)) {
                updateRecursive([...path, key], val);
            }
        } else {
            configDoc.setIn(path, value);
        }
    };
    
    // Explicitly handle root-level scalar values like jwtSecret
    for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
            updateRecursive([key], value);
        }
    }
}

loadConfig();

export function saveConfig() {
    try {
        syncDoc();
        const yamlOutput = configDoc.toString();
        fs.writeFileSync(CONFIG_PATH, yamlOutput);    
    } catch (e) {
        logger.error({ err: e, path: CONFIG_PATH }, "Failed to save config.yaml");
        throw e;
    }
}

if (!config.jwtSecret) {
    logger.info("No JWT secret found in config.yaml, generating a new one...");
    config.jwtSecret = crypto.randomBytes(64).toString("hex");
    try {
        saveConfig();
        logger.info("Generated new JWT secret and saved to config.yaml");
    } catch (e) {
        logger.error({ err: e }, "Failed to save generated JWT secret to config.yaml");
    }
}

if (!config.tunnel?.keySecret) {
    logger.info("No tunnel key secret found in config.yaml, generating a new one...");
    config.tunnel = { ...DEFAULT_TUNNEL, ...(config.tunnel ?? {}) };
    config.tunnel.keySecret = crypto.randomBytes(32).toString("hex");
    try {
        saveConfig();
        logger.info("Generated new tunnel key secret and saved to config.yaml");
    } catch (e) {
        logger.error({ err: e }, "Failed to save generated tunnel key secret to config.yaml");
    }
}

/**
 * Checks config.yaml and fills in every default, once, at startup.
 *
 * Runs after the two secrets above have been repaired, and before anything reads a value:
 * a configuration error is a startup failure, not something to discover on the first
 * tunnel lease three hours in. That is why it exits instead of falling back to defaults —
 * a server that quietly ran on `maxConcurrentTunnels: 20` because the operator's `"zwanzig"`
 * was ignored would be worse than one that refuses to start and says so.
 *
 * The parsed result is written back through syncDoc(), so the defaults it applied become
 * visible in the file instead of staying implicit.
 */
function validateConfig(): AppConfig {
    const parsed = AppConfigSchema.safeParse(config);

    if (!parsed.success) {
        logger.fatal(
            { path: CONFIG_PATH },
            `Invalid config.yaml — ${firstIssue(parsed.error)}`,
        );
        process.exit(1);
    }

    config = parsed.data;
    try {
        saveConfig();
    } catch {
        // Already logged by saveConfig(). A read-only config file is not a reason to
        // refuse service — the values are valid, they just cannot be written back.
    }
    return parsed.data;
}

export const appConfig: AppConfig = validateConfig();

export function updateConfig(updates: Partial<AppConfig>) {
    Object.assign(appConfig, updates);
    config = appConfig;
    saveConfig();
}

let oidcConfig: client.Configuration | null = null;

export async function initOIDC() {
    if (appConfig.oidc && appConfig.oidc.enabled) {
        try {
            oidcConfig = await client.discovery(
                new URL(appConfig.oidc.issuer),
                appConfig.oidc.client_id,
                appConfig.oidc.client_secret
            );
            logger.info("OIDC Client initialized");
        } catch (e) {
            logger.error({ err: e }, "Failed to initialize OIDC client");
        }
    }
}

export function getOidcConfig() {
    return oidcConfig;
}
