import type { AppConfig } from "../config/AppConfig.js";
import { appConfig, updateConfig } from "../config/AppConfig.js";
import { logger } from "@pbcm/shared/node";

/**
 * Reads and writes the operator-facing part of `config.yaml`.
 *
 * The `settings` block plus `security`, and nothing else: the remaining keys in that file
 * -- `jwtSecret`, the OIDC credentials -- are startup configuration and deliberately have
 * no API surface.
 */
export class SettingsService {
    /**
     * One setting as a string, whatever YAML made of it.
     *
     * The settings block is a loose object, so a value arrives as whatever the file says:
     * `retention_job_history_days: 30` without quotes is a *number* to the YAML parser,
     * while the settings page writes the same value as `"30"`. Both mean the same thing to
     * every caller here — they all hand the result to `parseInt` — so the two spellings
     * are levelled out at this boundary instead of at four call sites.
     */
    static getSetting(key: string): string | null {
        try {
            const value = appConfig.settings[key];
            if (value === undefined || value === null || value === "") return null;
            if (typeof value === "string") return value;
            if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
            }
            // An object or array here is a malformed setting, not a value to coerce.
            logger.warn({ key }, "Setting is not a scalar value, ignoring it");
            return null;
        } catch (e) {
            logger.error({ err: e, key }, "Failed to get setting");
            return null;
        }
    }

    /**
     * Everything the settings page shows. `security` travels alongside the settings block
     * rather than inside it because that is where it lives in the file, and the page reads
     * this object and posts it back unchanged.
     */
    static getAllSettings(): Record<string, unknown> {
        try {
            return {
                ...appConfig.settings,
                security: appConfig.security,
            };
        } catch (e) {
            logger.error({ err: e }, "Failed to get all settings");
            return {};
        }
    }

    static updateSettings(settings: Record<string, unknown>): void {
        try {
            // `security` is a sibling of `settings` in the file, so it has to be lifted
            // back out of the flat object the page sends before the rest is merged in.
            const { security, ...rest } = settings;

            const updates: Partial<AppConfig> = {
                settings: {
                    ...appConfig.settings,
                    ...(rest as Record<string, string>),
                },
            };
            if (security) {
                updates.security = security as AppConfig["security"];
            }

            updateConfig(updates);
        } catch (e) {
            logger.error({ err: e }, "Failed to update settings");
            throw e;
        }
    }
}
