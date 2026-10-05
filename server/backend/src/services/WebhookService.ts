import {
    WS_EVENTS,
    SAMPLE_WEBHOOK_CLIENT,
    buildWebhookContext,
    renderTemplate,
    renderTemplateText,
    sampleWebhookEvent,
    webhookAccepts,
    type Webhook,
    type WebhookClientInfo,
    type WebhookEvent,
    type WebhookFields,
    type WebhookTestResult,
} from "@pbcm/shared";
import { logger } from "@pbcm/shared/node";
import { ClientRepository } from "../repositories/ClientRepository.js";
import { WebhookRepository } from "../repositories/WebhookRepository.js";
import { ProxyService } from "./ProxyService.js";

/** The waits before the second and the third attempt. */
const RETRY_DELAYS_MS = [1_000, 5_000];

/** How much of a target's answer is kept, for the editor to show why it refused. */
const RESPONSE_PREVIEW_CHARS = 500;

/**
 * Deliveries one webhook may have waiting. A target that hangs for its whole timeout on
 * every attempt falls behind a burst of events -- an agent handing over a day of runs after
 * an outage is one; past this, new ones are dropped with a log line instead of piling up in
 * memory for as long as the target is down.
 */
const MAX_PENDING_PER_WEBHOOK = 100;

interface Delivery {
    status: number | null;
    error: string | null;
    response: string | null;
}

interface Request {
    url: string;
    headers: Record<string, string>;
    body: unknown;
}

/** Deliveries per webhook run one after another, so a target sees events in their order. */
const queues = new Map<string, { tail: Promise<void>; pending: number }>();

/**
 * Who a client is to a template, read when the event is sent: a rename is in the next
 * delivery without anything having to be told. A client deleted meanwhile is its id.
 */
function clientInfo(clientId: string): WebhookClientInfo {
    const row = ClientRepository.findById(clientId);
    if (!row) return { id: clientId, displayName: null, hostname: null };
    return { id: row.id, displayName: row.display_name, hostname: row.hostname };
}

/** Renders one delivery. Throws on a template that does not parse -- the save should have caught it. */
function render(webhook: WebhookFields, event: WebhookEvent, client: WebhookClientInfo): Request {
    const context = buildWebhookContext(event, client, webhook.name);
    const headers: Record<string, string> = { "content-type": "application/json" };
    for (const [name, value] of Object.entries(webhook.headers)) {
        headers[name.toLowerCase()] = renderTemplateText(value, context);
    }
    return {
        url: renderTemplateText(webhook.url, context),
        headers,
        body: renderTemplate(JSON.parse(webhook.bodyTemplate), context),
    };
}

async function send(webhook: WebhookFields, request: Request): Promise<Delivery> {
    try {
        const response = await fetch(request.url, {
            method: webhook.method,
            headers: request.headers,
            body: JSON.stringify(request.body),
            signal: AbortSignal.timeout(webhook.timeoutMs),
        });
        const text = (await response.text().catch(() => "")).slice(0, RESPONSE_PREVIEW_CHARS);
        return {
            status: response.status,
            error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim(),
            response: text || null,
        };
    } catch (err) {
        const error = err as Error;
        // undici hides the actual cause one level down, and a refused connection to a name
        // with several addresses is an AggregateError whose own message is empty.
        const cause = error.cause as (Error & { code?: string; errors?: Error[] }) | undefined;
        const message =
            error.name === "TimeoutError"
                ? `No answer within ${webhook.timeoutMs} ms`
                : cause?.message || cause?.errors?.[0]?.message || cause?.code || error.message;
        return { status: null, error: message, response: null };
    }
}

/** Worth another try: nothing answered, the target failed, or it asked to slow down. */
function retryable(delivery: Delivery): boolean {
    return delivery.status === null || delivery.status >= 500 || delivery.status === 429;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Keeps the outcome and has the dashboards fetch the list again. */
function recordResult(webhook: Webhook, status: number | null, error: string | null): void {
    try {
        WebhookRepository.recordResult(webhook.id, status, error, new Date().toISOString());
    } catch (err) {
        logger.warn({ err, webhook: webhook.name }, "Could not store the webhook result");
        return;
    }
    ProxyService.broadcastToDashboard({ type: WS_EVENTS.WEBHOOKS_UPDATE });
}

async function deliver(webhook: Webhook, event: WebhookEvent, clientId: string): Promise<void> {
    let request: Request;
    try {
        request = render(webhook, event, clientInfo(clientId));
    } catch (err) {
        const error = `Template could not be rendered: ${(err as Error).message}`;
        // `reason`, not `error`: pino-pretty takes that key for an Error object and drops a string.
        logger.warn({ webhook: webhook.name, event: event.id, reason: error }, "Webhook not sent");
        recordResult(webhook, null, error);
        return;
    }

    let delivery = await send(webhook, request);
    for (const delay of RETRY_DELAYS_MS) {
        if (delivery.error === null || !retryable(delivery)) break;
        await wait(delay);
        delivery = await send(webhook, request);
    }

    // Logged without the request: its headers are where a token would be.
    if (delivery.error !== null) {
        logger.warn(
            { webhook: webhook.name, event: event.id, kind: event.kind, reason: delivery.error },
            "Webhook delivery failed",
        );
    } else {
        logger.debug({ webhook: webhook.name, event: event.id }, "Webhook delivered");
    }
    recordResult(webhook, delivery.status, delivery.error);
}

function enqueue(webhook: Webhook, event: WebhookEvent, clientId: string): void {
    const queue = queues.get(webhook.id) ?? { tail: Promise.resolve(), pending: 0 };
    if (queue.pending >= MAX_PENDING_PER_WEBHOOK) {
        logger.warn(
            { webhook: webhook.name, event: event.id },
            "Webhook is too far behind, dropping the event for it",
        );
        return;
    }
    queue.pending++;
    queue.tail = queue.tail
        .then(() => deliver(webhook, event, clientId))
        .catch((err) => logger.error({ err, webhook: webhook.name }, "Webhook delivery threw"))
        .finally(() => {
            queue.pending--;
            if (queue.pending === 0) queues.delete(webhook.id);
        });
    queues.set(webhook.id, queue);
}

/**
 * Sends the webhooks. The server is the only sender: the agents keep every run until the
 * server has acknowledged it, so a run that ends while the server is away is reported late,
 * never lost -- and one place holds the targets' tokens and has to reach them.
 *
 * There is no persistent queue. A restart during a retry loses that delivery; the run itself
 * stays in the history.
 */
export class WebhookService {
    /**
     * Hands events of one client to every enabled webhook whose filters they pass. Returns at once: the deliveries run behind it, so a slow
     * target never holds up an agent's acknowledgement.
     */
    static dispatch(clientId: string, events: WebhookEvent[]): void {
        if (events.length === 0) return;
        let webhooks: Webhook[];
        try {
            webhooks = WebhookRepository.findEnabled();
        } catch (err) {
            logger.error({ err }, "Could not read the webhooks");
            return;
        }
        for (const event of events) {
            for (const webhook of webhooks) {
                if (webhookAccepts(webhook, event)) enqueue(webhook, event, clientId);
            }
        }
    }

    /**
     * Sends the sample event for the webhook's kinds once, with what the editor holds --
     * saved or not -- and reports the answer. No retries and no stored result: the operator
     * is watching.
     */
    static async test(webhook: WebhookFields): Promise<WebhookTestResult> {
        let request: Request;
        try {
            request = render(webhook, sampleWebhookEvent(webhook.kinds), SAMPLE_WEBHOOK_CLIENT);
        } catch (err) {
            return {
                ok: false,
                status: null,
                error: `Template could not be rendered: ${(err as Error).message}`,
                body: null,
                response: null,
            };
        }
        const delivery = await send(webhook, request);
        return {
            ok: delivery.error === null,
            status: delivery.status,
            error: delivery.error,
            body: request.body,
            response: delivery.response,
        };
    }
}
