import { createTemplateEngine, matchesKindPattern } from "@stefgo/js-template-engine";
import { WEBHOOK_LEVELS } from "./constants.js";
import {
    clientDisconnectedEvent,
    clientReconnectedEvent,
    jobRunEvent,
    type JobRunEvent,
    type WebhookEvent,
    type WebhookRun,
} from "./webhookEvent.js";
import type { WebhookLevel } from "./types.js";

export { matchesKindPattern };

/**
 * The JSON a webhook sends, written by the operator.
 *
 * The language is the one of `@stefgo/js-template-engine`: `{{path}}` placeholders, filters,
 * `$if`, `$map` and `$join`, filled in on the parsed tree, so what an event carries cannot
 * break the JSON or smuggle in keys of its own. Its README describes the grammar. What is
 * decided here is the context -- what a template can read -- and which events a webhook takes.
 *
 * The engine is free of Node, so the settings page previews a template with the same code the
 * server sends it with -- a preview that rendered differently would be worse than none.
 */

/** What a placeholder may start with. Anything else is a typo, and is refused on save. */
export const WEBHOOK_TEMPLATE_ROOTS = ["event", "client", "webhook"] as const;

export interface WebhookContext {
    event: WebhookEvent;
    client: {
        id: string;
        /** The display name the server knows the client by, else its hostname. */
        name: string;
        hostname: string | null;
    };
    webhook: {
        name: string;
    };
}

/** The part of a client a template can see. */
export interface WebhookClientInfo {
    id: string;
    displayName: string | null;
    hostname: string | null;
}

export function buildWebhookContext(
    event: WebhookEvent,
    client: WebhookClientInfo,
    webhookName: string,
): WebhookContext {
    return {
        event,
        client: {
            id: client.id,
            name: client.displayName || client.hostname || client.id,
            hostname: client.hostname,
        },
        webhook: { name: webhookName },
    };
}

// ── Engine ───────────────────────────────────────────────────────────────────

const engine = createTemplateEngine({ roots: WEBHOOK_TEMPLATE_ROOTS });

/** Fills the placeholders of a string as text: for a URL or a header. */
export function renderTemplateText(text: string, context: WebhookContext): string {
    return engine.renderTemplateText(text, context);
}

/** Fills a parsed template. Throws on a template that does not compile. */
export function renderTemplate(template: unknown, context: WebhookContext): unknown {
    return engine.renderTemplate(template, context);
}

/**
 * Why a body template cannot be used, or null. Checked on save, so a broken template is
 * refused in the editor instead of failing on the first event, when nobody is looking.
 */
export function webhookTemplateError(source: string): string | null {
    return engine.templateError(source);
}

/** Why strings with placeholders -- a URL, header values -- cannot be used, or null. */
export function placeholderError(node: unknown): string | null {
    return engine.placeholderError(node);
}

// ── Filters ──────────────────────────────────────────────────────────────────

/** Whether an event passes a webhook's filters: its level at least, and one of its kinds. */
export function webhookAccepts(
    filter: { minLevel: WebhookLevel; kinds: string[] },
    event: Pick<WebhookEvent, "kind" | "level">,
): boolean {
    if (WEBHOOK_LEVELS.indexOf(event.level) < WEBHOOK_LEVELS.indexOf(filter.minLevel)) {
        return false;
    }
    return filter.kinds.length === 0 || filter.kinds.some((p) => matchesKindPattern(event.kind, p));
}

// ── Sample ───────────────────────────────────────────────────────────────────

const SAMPLE_START = "2026-09-28T02:00:00.000Z";
const SAMPLE_END = "2026-09-28T02:14:37.000Z";

const SAMPLE_RUN: WebhookRun = {
    id: "00000000-0000-4000-8000-000000000000",
    jobId: "11111111-1111-4111-8111-111111111111",
    name: "Daily /home",
    type: "backup",
    status: "failed",
    startTime: SAMPLE_START,
    endTime: SAMPLE_END,
    exitCode: 255,
    stderr: "Error: unable to open chunk store 'backup' - permission denied",
    snapshot: null,
    snapshotDetails: null,
    snapshotError: null,
};

const SAMPLE_BACKUP_TIME = Date.parse(SAMPLE_START) / 1000;

/** What a successful sample backup left on the PBS. */
const SAMPLE_SNAPSHOT: Pick<WebhookRun, "snapshot" | "snapshotDetails"> = {
    snapshot: "host/sample-client/2026-09-28T02:00:00Z",
    snapshotDetails: {
        backupType: "host",
        backupId: "sample-client",
        backupTime: SAMPLE_BACKUP_TIME,
        size: 53687091200,
        files: [
            { filename: "home.pxar.didx", size: 53687091200, cryptMode: "encrypt" },
            { filename: "index.json.blob", size: 612, cryptMode: "sign-only" },
        ],
    },
};

/** One per kind, in the order a preview looks for them. */
const SAMPLES: WebhookRun[] = [
    SAMPLE_RUN,
    { ...SAMPLE_RUN, status: "success", exitCode: 0, stderr: null, ...SAMPLE_SNAPSHOT },
    { ...SAMPLE_RUN, status: "abort", exitCode: null, stderr: "Aborted on daemon startup (leftover state)" },
    {
        ...SAMPLE_RUN,
        status: "skipped",
        endTime: SAMPLE_START,
        exitCode: null,
        stderr: "Job already running and another one is already queued.",
    },
    {
        ...SAMPLE_RUN,
        status: "missed",
        endTime: SAMPLE_START,
        exitCode: null,
        stderr: "Scheduled for 2026-09-27T18:48:00.000Z, started 7 h 12 min late.",
    },
];

const SAMPLE_CLIENT_ID = "sample-client";
const SAMPLE_DISCONNECTED_AT = "2026-09-28T02:20:00.000Z";

/**
 * The event a preview and a test delivery are rendered with: the first sample one of the
 * webhook's kinds matches, else a failed backup -- the event most webhooks are made for.
 */
export function sampleWebhookEvent(kinds: string[] = []): WebhookEvent {
    const events: WebhookEvent[] = [
        ...SAMPLES.map((run) => jobRunEvent(run) as JobRunEvent),
        clientDisconnectedEvent(
            "22222222-2222-4222-8222-222222222222",
            SAMPLE_CLIENT_ID,
            SAMPLE_DISCONNECTED_AT,
            "2026-09-28T02:22:00.000Z",
        ),
        clientReconnectedEvent(
            "33333333-3333-4333-8333-333333333333",
            SAMPLE_CLIENT_ID,
            SAMPLE_DISCONNECTED_AT,
            "2026-09-28T02:47:12.000Z",
        ),
    ];
    return events.find((e) => kinds.some((pattern) => matchesKindPattern(e.kind, pattern))) ?? events[0];
}

export const SAMPLE_WEBHOOK_CLIENT: WebhookClientInfo = {
    id: SAMPLE_CLIENT_ID,
    displayName: "fileserver",
    hostname: "fileserver.example.net",
};

/** What a new webhook starts with: small, but using each part of the context once. */
export const DEFAULT_WEBHOOK_TEMPLATE = `{
    "text": "[{{event.level}}] {{client.name}}: {{event.message}}",
    "kind": "{{event.kind}}",
    "occurredAt": "{{event.occurredAt}}",
    "detail": "{{event.detail}}",
    "data": "{{event.data}}"
}`;
