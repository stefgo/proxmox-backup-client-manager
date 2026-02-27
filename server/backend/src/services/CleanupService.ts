import cron from 'node-cron';
import db from '../core/Database.js';
import { SettingsService } from './SettingsService.js';
import { logger } from '../core/Logger.js';

export class CleanupService {
    static initialize() {
        logger.info('Initializing CleanupService...');

        // Run on startup
        this.cleanupTokens();

        // Schedule daily at 00:00
        cron.schedule('0 0 * * *', () => {
            logger.info('Running scheduled token cleanup...');
            this.cleanupTokens();
        });
    }

    static cleanupTokens() {
        try {
            const retentionDaysStr = SettingsService.getSetting('retention_invalid_tokens_days') || '30';
            const minCountStr = SettingsService.getSetting('retention_invalid_tokens_count') || '10';

            const retentionDays = parseInt(retentionDaysStr);
            const minCount = parseInt(minCountStr);

            // 1. Get all invalid tokens (used or expired) ordered by created_at DESC
            // Note: SQLite DATETIME comparisons work fine with strings in ISO format.
            const invalidTokens = db.prepare(`
                SELECT token FROM registration_tokens 
                WHERE used_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at < datetime('now'))
                ORDER BY created_at DESC
            `).all() as { token: string }[];

            if (invalidTokens.length <= minCount) {
                logger.debug(`Found ${invalidTokens.length} invalid tokens, which is <= minCount (${minCount}). Skipping cleanup.`);
                return 0;
            }

            // 2. Identify tokens to potentially delete (those beyond the minCount)
            const candidateTokens = invalidTokens.slice(minCount);

            // 3. Delete those that substracting retentionDays from now are still older than their creation/invalidation
            // Actually, the requirement says "Retention time in days". 
            // We'll use created_at as the reference for simplicity, or we could use used_at/expires_at.
            // Let's use the most conservative one: max(created_at, used_at, expires_at)

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffStr = cutoffDate.toISOString();

            let deletedCount = 0;
            const deleteStmt = db.prepare('DELETE FROM registration_tokens WHERE token = ?');

            const transaction = db.transaction((tokens: { token: string }[]) => {
                for (const item of tokens) {
                    // We check if it's older than cutoff
                    // We need the actual token data to check the date
                    const tokenData = db.prepare('SELECT created_at, used_at, expires_at FROM registration_tokens WHERE token = ?').get(item.token) as any;

                    const dateToCompare = tokenData.used_at || tokenData.expires_at || tokenData.created_at;

                    if (dateToCompare < cutoffStr) {
                        deleteStmt.run(item.token);
                        deletedCount++;
                    }
                }
            });

            transaction(candidateTokens);

            if (deletedCount > 0) {
                logger.info(`Cleaned up ${deletedCount} invalid client tokens.`);
            } else {
                logger.debug('No tokens matched the retention time cutoff.');
            }

            return deletedCount;

        } catch (e) {
            logger.error({ err: e }, 'Failed to cleanup tokens');
            return 0;
        }
    }
}
