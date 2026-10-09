import { describe, expect, it } from "vitest";
import {
    DEFAULT_WEBHOOK_TEMPLATE,
    SAMPLE_WEBHOOK_CLIENT,
    buildWebhookContext,
    placeholderError,
    renderTemplate,
    sampleWebhookEvent,
    webhookAccepts,
    webhookTemplateError,
} from "./webhookTemplate.js";

describe("the roots of a webhook template", () => {
    // The grammar is tested where it lives, in @stefgo/js-template-engine. What is decided
    // here is what a path may start with.
    it("reads the event, the client and the webhook", () => {
        expect(webhookTemplateError('{"text": "{{event.kind}} {{client.name}} {{webhook.name}}"}')).toBeNull();
        expect(placeholderError(["https://example.org/{{client.id}}", "Bearer {{webhook.name}}"])).toBeNull();
    });

    it("refuses a path that starts with anything else", () => {
        expect(webhookTemplateError('{"text": "{{host.name}}"}')).toBe(
            'text: "{{host.name}}": a path starts with event, client, webhook',
        );
        expect(placeholderError("{{host.name}}")).toBe('"{{host.name}}": a path starts with event, client, webhook');
    });
});

describe("buildWebhookContext", () => {
    const event = sampleWebhookEvent();

    it("names the client by display name, else hostname, else id", () => {
        const name = (displayName: string | null, hostname: string | null) =>
            buildWebhookContext(event, { id: "c1", displayName, hostname }, "Chat").client.name;
        expect(name("Web", "web01")).toBe("Web");
        expect(name(null, "web01")).toBe("web01");
        expect(name("", "web01")).toBe("web01");
        expect(name(null, null)).toBe("c1");
    });

    it("carries the webhook's name and the event", () => {
        const built = buildWebhookContext(event, SAMPLE_WEBHOOK_CLIENT, "Chat");
        expect(built.webhook).toEqual({ name: "Chat" });
        expect(built.event).toBe(event);
    });
});

describe("webhookAccepts", () => {
    it("lets through a level at or above the minimum", () => {
        const accepts = (level: "info" | "warning" | "error") =>
            webhookAccepts({ minLevel: "warning", kinds: [] }, { kind: "job.failed", level });
        expect(accepts("info")).toBe(false);
        expect(accepts("warning")).toBe(true);
        expect(accepts("error")).toBe(true);
    });

    it("lets every kind through when none is named", () => {
        expect(webhookAccepts({ minLevel: "info", kinds: [] }, { kind: "client.reconnected", level: "info" })).toBe(
            true,
        );
    });

    it("needs one of the kinds to match", () => {
        const filter = { minLevel: "info" as const, kinds: ["client.*", "job.failed"] };
        expect(webhookAccepts(filter, { kind: "job.failed", level: "error" })).toBe(true);
        expect(webhookAccepts(filter, { kind: "client.disconnected", level: "warning" })).toBe(true);
        expect(webhookAccepts(filter, { kind: "job.succeeded", level: "info" })).toBe(false);
    });

    it("needs both the level and the kind", () => {
        expect(
            webhookAccepts({ minLevel: "error", kinds: ["job.*"] }, { kind: "job.aborted", level: "warning" }),
        ).toBe(false);
    });
});

describe("sampleWebhookEvent", () => {
    it("is a failed backup unless a kind asks for something else", () => {
        expect(sampleWebhookEvent().kind).toBe("job.failed");
        expect(sampleWebhookEvent([]).kind).toBe("job.failed");
        expect(sampleWebhookEvent(["no.such.kind"]).kind).toBe("job.failed");
    });

    it("is the first sample one of the kinds matches", () => {
        expect(sampleWebhookEvent(["job.succeeded"]).kind).toBe("job.succeeded");
        expect(sampleWebhookEvent(["job.aborted"]).kind).toBe("job.aborted");
        expect(sampleWebhookEvent(["job.skipped"]).kind).toBe("job.skipped");
        expect(sampleWebhookEvent(["job.missed"]).kind).toBe("job.missed");
        expect(sampleWebhookEvent(["client.*"]).kind).toBe("client.disconnected");
        expect(sampleWebhookEvent(["client.reconnected"]).kind).toBe("client.reconnected");
        // The order is the samples', not the webhook's.
        expect(sampleWebhookEvent(["client.*", "job.succeeded"]).kind).toBe("job.succeeded");
    });

    it("carries a snapshot only for the backup that succeeded", () => {
        expect(sampleWebhookEvent(["job.succeeded"]).data).toMatchObject({ snapshot: { size: 53687091200 } });
        expect(sampleWebhookEvent(["job.failed"]).data).toMatchObject({ snapshot: null });
    });
});

describe("DEFAULT_WEBHOOK_TEMPLATE", () => {
    it("compiles", () => {
        expect(webhookTemplateError(DEFAULT_WEBHOOK_TEMPLATE)).toBeNull();
    });

    it.each([
        "job.failed",
        "job.succeeded",
        "job.aborted",
        "job.skipped",
        "job.missed",
        "client.disconnected",
        "client.reconnected",
    ])("renders the %s sample", (kind) => {
        const event = sampleWebhookEvent([kind]);
        expect(event.kind).toBe(kind);
        const body = renderTemplate(
            JSON.parse(DEFAULT_WEBHOOK_TEMPLATE),
            buildWebhookContext(event, SAMPLE_WEBHOOK_CLIENT, "Chat"),
        );
        expect(body).toMatchObject({ text: expect.stringContaining(event.message), kind });
    });
});
