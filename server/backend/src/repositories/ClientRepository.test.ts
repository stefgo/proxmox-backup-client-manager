import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/AppConfig.js", () => ({
    appConfig: { secretKey: "test-secret-key" },
    secretKeyPersisted: () => true,
}));
vi.mock("../core/Database.js", async () => {
    const { migratedMemoryDatabase } = await import("../testing/memoryDatabase.js");
    return { default: await migratedMemoryDatabase() };
});

import db from "../core/Database.js";
import { ClientRepository, hashToken } from "./ClientRepository.js";

const MINUTE_MS = 60_000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

beforeEach(() => {
    db.exec("DELETE FROM clients");
});

/** A client that waits for its agent, with an open token. */
function pending(id: string, allowedIp: string | null = null, token = `token-${id}`) {
    ClientRepository.createPendingInbound(id, `Host ${id}`, allowedIp);
    ClientRepository.setRegistrationToken(id, token, fromNow(30 * MINUTE_MS));
    return token;
}

describe("hashToken", () => {
    it("is the SHA-256 of the token, in hex", () => {
        // The well-known digest of "abc".
        expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });
});

describe("a waiting inbound client", () => {
    it("has a name and a token, and nothing an agent would have reported", () => {
        const token = pending("c1", "10.0.0.0/24");
        expect(ClientRepository.findById("c1")).toMatchObject({
            display_name: "Host c1",
            connection_mode: "inbound",
            inbound_allowed_ip: "10.0.0.0/24",
            hostname: null,
            auth_token: null,
            last_seen: null,
            registration_token_hash: hashToken(token),
        });
    });

    it("is found by its token while the token is valid, with the network it is bound to", () => {
        const token = pending("c1", "10.0.0.0/24");
        expect(ClientRepository.findByValidRegistrationToken(token)).toEqual({
            id: "c1",
            auth_token: null,
            inbound_allowed_ip: "10.0.0.0/24",
        });
    });

    it("is not found by an expired token", () => {
        ClientRepository.createPendingInbound("c1", "Host c1", null);
        ClientRepository.setRegistrationToken("c1", "old", fromNow(-MINUTE_MS));
        expect(ClientRepository.findByValidRegistrationToken("old")).toBeUndefined();
    });

    it("is not found by a token that a new one replaced", () => {
        const first = pending("c1");
        ClientRepository.setRegistrationToken("c1", "second", fromNow(30 * MINUTE_MS));
        expect(ClientRepository.findByValidRegistrationToken(first)).toBeUndefined();
        expect(ClientRepository.findByValidRegistrationToken("second")?.id).toBe("c1");
    });

    it("gets no token when it is an outbound client", () => {
        ClientRepository.createOutbound("o1", "host", "host:3001", "auth", null);
        const { changes } = ClientRepository.setRegistrationToken("o1", "t", fromNow(30 * MINUTE_MS));
        expect(changes).toBe(0);
    });
});

describe("completeRegistration", () => {
    it("binds the agent and uses the token up", () => {
        const token = pending("c1");
        expect(ClientRepository.completeRegistration("c1", token, "pve-01", "auth")).toBe(true);

        const row = ClientRepository.findById("c1")!;
        expect(row).toMatchObject({
            hostname: "pve-01",
            auth_token: hashToken("auth"),
            registration_token_hash: null,
            registration_expires_at: null,
        });
        expect(row.last_seen).not.toBeNull();
        expect(ClientRepository.findByIdAndToken("c1", "auth")?.id).toBe("c1");
    });

    it("registers one agent per token", () => {
        const token = pending("c1");
        expect(ClientRepository.completeRegistration("c1", token, "first", "a1")).toBe(true);
        expect(ClientRepository.completeRegistration("c1", token, "second", "a2")).toBe(false);
        expect(ClientRepository.findById("c1")?.hostname).toBe("first");
    });

    it("refuses an expired token", () => {
        ClientRepository.createPendingInbound("c1", "Host c1", null);
        ClientRepository.setRegistrationToken("c1", "old", fromNow(-MINUTE_MS));
        expect(ClientRepository.completeRegistration("c1", "old", "pve-01", "auth")).toBe(false);
    });

    // Only the operator's choice is a decision: no address is taken from the agent.
    it("leaves the allowed address as the operator set it", () => {
        const open = pending("c1");
        ClientRepository.completeRegistration("c1", open, "pve-01", "auth");
        expect(ClientRepository.findById("c1")?.inbound_allowed_ip).toBeNull();

        const bound = pending("c2", "10.0.0.0/24");
        ClientRepository.completeRegistration("c2", bound, "pve-02", "auth2");
        expect(ClientRepository.findById("c2")?.inbound_allowed_ip).toBe("10.0.0.0/24");
    });

    it("puts a new agent under a client that had one", () => {
        const first = pending("c1");
        ClientRepository.completeRegistration("c1", first, "pve-01", "auth");

        ClientRepository.setRegistrationToken("c1", "again", fromNow(30 * MINUTE_MS));
        expect(ClientRepository.findByValidRegistrationToken("again")?.auth_token).toBe(hashToken("auth"));
        ClientRepository.completeRegistration("c1", "again", "pve-01b", "auth2");

        expect(ClientRepository.findById("c1")?.hostname).toBe("pve-01b");
        expect(ClientRepository.findByIdAndToken("c1", "auth")).toBeUndefined();
        expect(ClientRepository.findByIdAndToken("c1", "auth2")?.id).toBe("c1");
    });
});
