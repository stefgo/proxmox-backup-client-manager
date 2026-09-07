import type { AppConfig } from "../config/AppConfig.js";
import { appConfig, updateConfig } from "../config/AppConfig.js";
import { logger } from "../core/logger.js";

/**
 * Reads and writes the operator-facing part of `config.yaml`.
 *
 * The `settings` block plus `security`, and nothing else: the remaining keys in that file
 * -- `jwtSecret`, the OIDC credentials -- are startup configuration and deliberately have
 * no API surface.
 */
export class SettingsService {
    static getSetting(key: string): string | null {
        try {
            return appConfig.settings[key] || null;
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
