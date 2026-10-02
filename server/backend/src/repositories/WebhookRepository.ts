import db from "../core/Database.js";
import {
    WEBHOOK_LEVELS,
    WEBHOOK_METHODS,
    type Webhook,
    type WebhookFields,
    type WebhookLevel,
} from "@pbcm/shared";

/** A row of the `webhooks` table (migrations 15 and 19), in its raw snake_case columns. */
interface WebhookRow {
    id: string;
    name: string;
    enabled: number;
    url: string;
    method: string;
    headers: string;
    body_template: string;
    min_level: string;
    kinds: string;
    timeout_ms: number;
    last_status: number | null;
    last_error: string | null;
    last_attempt_at: string | null;
    created_at: string;
    updated_at: string | null;
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// The JSON columns are only ever written from checked input, but a row edited by hand must
// not take the whole list down: what does not read reads as empty.
function headersColumn(text: string): Record<string, string> {
    const value = parseJson(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
}

function stringsColumn(text: string): string[] {
    const value = parseJson(text);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function rowToWebhook(row: WebhookRow): Webhook {
    return {
        id: row.id,
        name: row.name,
        enabled: row.enabled === 1,
        url: row.url,
        method: (WEBHOOK_METHODS as readonly string[]).includes(row.method)
            ? (row.method as Webhook["method"])
            : "POST",
        headers: headersColumn(row.headers),
        bodyTemplate: row.body_template,
        minLevel: (WEBHOOK_LEVELS as readonly string[]).includes(row.min_level)
            ? (row.min_level as WebhookLevel)
            : "warning",
        kinds: stringsColumn(row.kinds),
        timeoutMs: row.timeout_ms,
        lastStatus: row.last_status,
        lastError: row.last_error,
        lastAttemptAt: row.last_attempt_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class WebhookRepository {
    static findAll(): Webhook[] {
        const rows = db.prepare("SELECT * FROM webhooks ORDER BY name COLLATE NOCASE").all() as WebhookRow[];
        return rows.map(rowToWebhook);
    }

    static findEnabled(): Webhook[] {
        const rows = db.prepare("SELECT * FROM webhooks WHERE enabled = 1").all() as WebhookRow[];
        return rows.map(rowToWebhook);
    }

    static findById(id: string): Webhook | undefined {
        const row = db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as WebhookRow | undefined;
        return row ? rowToWebhook(row) : undefined;
    }

    static create(id: string, fields: WebhookFields): void {
        db.prepare(`
            INSERT INTO webhooks
                (id, name, enabled, url, method, headers, body_template, min_level, kinds,
                 timeout_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            fields.name,
            fields.enabled ? 1 : 0,
            fields.url,
            fields.method,
            JSON.stringify(fields.headers),
            fields.bodyTemplate,
            fields.minLevel,
            JSON.stringify(fields.kinds),
            fields.timeoutMs,
            new Date().toISOString(),
        );
    }

    static update(id: string, fields: WebhookFields): { changes: number } {
        return db.prepare(`
            UPDATE webhooks
            SET name = ?, enabled = ?, url = ?, method = ?, headers = ?, body_template = ?,
                min_level = ?, kinds = ?, timeout_ms = ?, updated_at = ?
            WHERE id = ?
        `).run(
            fields.name,
            fields.enabled ? 1 : 0,
            fields.url,
            fields.method,
            JSON.stringify(fields.headers),
            fields.bodyTemplate,
            fields.minLevel,
            JSON.stringify(fields.kinds),
            fields.timeoutMs,
            new Date().toISOString(),
            id,
        );
    }

    static delete(id: string): { changes: number } {
        return db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
    }

    /**
     * Stores how a delivery went. A webhook deleted while it was being sent is simply not
     * found; one older than what is stored -- a slow retry overtaken by a newer delivery --
     * does not replace it.
     */
    static recordResult(id: string, status: number | null, error: string | null, attemptAt: string): void {
        db.prepare(`
            UPDATE webhooks SET last_status = ?, last_error = ?, last_attempt_at = ?
            WHERE id = ? AND (last_attempt_at IS NULL OR last_attempt_at <= ?)
        `).run(status, error, attemptAt, id, attemptAt);
    }
}
