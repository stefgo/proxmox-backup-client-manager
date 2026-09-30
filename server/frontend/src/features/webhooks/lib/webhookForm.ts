import {
    DEFAULT_WEBHOOK_TEMPLATE,
    SAMPLE_WEBHOOK_CLIENT,
    buildWebhookContext,
    renderTemplate,
    sampleWebhookEvent,
    webhookTemplateError,
    type Webhook,
    type WebhookInput,
    type WebhookLevel,
} from '@pbcm/shared';

/** The editor's fields, as typed. Headers and kinds are text until they are sent. */
export interface WebhookDraft {
    name: string;
    enabled: boolean;
    url: string;
    method: 'POST' | 'PUT';
    /** One `Name: value` per line. */
    headers: string;
    bodyTemplate: string;
    minLevel: WebhookLevel;
    /** Comma separated kind patterns. */
    kinds: string;
    /** Every client, new ones included -- stored as an empty list. */
    allClients: boolean;
    clientIds: string[];
    timeoutSeconds: string;
}

export const EMPTY_DRAFT: WebhookDraft = {
    name: '',
    enabled: true,
    url: '',
    method: 'POST',
    headers: '',
    bodyTemplate: DEFAULT_WEBHOOK_TEMPLATE,
    minLevel: 'warning',
    kinds: '',
    allClients: true,
    clientIds: [],
    timeoutSeconds: '10',
};

export function draftFrom(webhook: Webhook): WebhookDraft {
    return {
        name: webhook.name,
        enabled: webhook.enabled,
        url: webhook.url,
        method: webhook.method,
        headers: Object.entries(webhook.headers)
            .map(([name, value]) => `${name}: ${value}`)
            .join('\n'),
        bodyTemplate: webhook.bodyTemplate,
        minLevel: webhook.minLevel,
        kinds: webhook.kinds.join(', '),
        allClients: webhook.clientIds.length === 0,
        clientIds: webhook.clientIds,
        timeoutSeconds: String(webhook.timeoutMs / 1000),
    };
}

/**
 * The draft as the API takes it. Throws on a header line without a colon -- the one mistake
 * the server could not name, because by then the line would already be gone -- and on a
 * client selection with nobody in it, which the server would read as "every client".
 */
export function inputFrom(draft: WebhookDraft): WebhookInput {
    const headers: Record<string, string> = {};
    draft.headers.split('\n').forEach((line, index) => {
        if (line.trim() === '') return;
        const colon = line.indexOf(':');
        if (colon <= 0) throw new Error(`Header line ${index + 1} is not "Name: value"`);
        headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    });
    if (!draft.allClients && draft.clientIds.length === 0) {
        throw new Error('Choose at least one client, or send from all clients');
    }
    return {
        name: draft.name,
        enabled: draft.enabled,
        url: draft.url,
        method: draft.method,
        headers,
        bodyTemplate: draft.bodyTemplate,
        minLevel: draft.minLevel,
        kinds: parseKinds(draft.kinds),
        clientIds: draft.allClients ? [] : draft.clientIds,
        timeoutMs: Math.round((parseFloat(draft.timeoutSeconds) || 10) * 1000),
    };
}

/** The kind patterns of the comma separated field. */
export function parseKinds(text: string): string[] {
    return text
        .split(',')
        .map((kind) => kind.trim())
        .filter((kind) => kind.length > 0);
}

/**
 * The body the sample event would produce, or why there is none. The sample is the one for
 * the webhook's kinds, as the test delivery sends it; `kind` says which it was. Rendered with
 * the same code the server sends with.
 */
export function previewBody(
    template: string,
    webhookName: string,
    kinds: string,
): { kind: string; body?: string; error?: string } {
    const event = sampleWebhookEvent(parseKinds(kinds));
    const error = webhookTemplateError(template);
    if (error) return { kind: event.kind, error };
    try {
        const context = buildWebhookContext(event, SAMPLE_WEBHOOK_CLIENT, webhookName);
        return { kind: event.kind, body: JSON.stringify(renderTemplate(JSON.parse(template), context), null, 2) };
    } catch (e) {
        return { kind: event.kind, error: (e as Error).message };
    }
}

/** What a template can reach, for the list beside the editor. */
export const PLACEHOLDERS: { path: string; description: string }[] = [
    { path: 'event.message', description: 'Backup "Daily /home" failed' },
    { path: 'event.detail', description: 'Last line of the error output, else null' },
    { path: 'event.kind', description: 'job.succeeded, job.failed, job.aborted, job.skipped, client.disconnected, client.reconnected' },
    { path: 'event.level', description: 'info, warning or error' },
    { path: 'event.occurredAt', description: 'When the run ended, or the connection closed or was back (ISO 8601)' },
    { path: 'event.id', description: 'The id of the run, or of the event' },
    { path: 'event.data', description: 'Runs: jobName, type, status, startTime, endTime, … Clients: disconnectedAt, reconnectedAt, durationSeconds' },
    { path: 'event.data.jobName', description: 'The job\'s name' },
    { path: 'event.data.type', description: 'backup or restore' },
    { path: 'event.data.durationSeconds', description: 'How long the run took, or the client was gone' },
    { path: 'event.data.exitCode', description: 'Exit code of proxmox-backup-client' },
    { path: 'client.name', description: 'Display name, else hostname' },
    { path: 'client.hostname', description: 'Hostname the agent reported' },
    { path: 'client.id', description: 'Client id' },
    { path: 'webhook.name', description: 'This webhook\'s name' },
];
