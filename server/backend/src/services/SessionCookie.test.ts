import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

// SessionCookie still reads the lifetime from the configuration, and AppConfig reads
// config.yaml when it is imported. The lifetime itself is not tested here: it is about to be
// taken from the token instead, and the test belongs to that change.
vi.mock("../config/AppConfig.js", () => ({ appConfig: { jwtExpiresIn: "2h" } }));

import {
    clearSessionCookies,
    SESSION_COOKIE,
    SESSION_FLAG_COOKIE,
    setSessionCookies,
} from "./SessionCookie.js";

/**
 * A server with the two plugins the cookies need and nothing else. `trustProxy` lets a
 * request say it arrived over https, the way one does behind a listed proxy.
 */
async function buildServer() {
    const server = Fastify({ trustProxy: true });
    await server.register(cookie);
    await server.register(jwt, { secret: "test-secret" });
    server.get("/login", (request, reply) => {
        const token = server.jwt.sign({ id: 1, username: "admin", tv: 0 });
        setSessionCookies(request, reply, token);
        return { token };
    });
    server.get("/logout", (_request, reply) => {
        clearSessionCookies(reply);
        return {};
    });
    return server;
}

type SetCookie = { name: string; value: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string };

const byName = (cookies: SetCookie[], name: string): SetCookie => {
    const found = cookies.find((c) => c.name === name);
    if (!found) throw new Error(`No ${name} cookie was set`);
    return found;
};

describe("setSessionCookies", () => {
    it("puts the token into an httpOnly cookie and a readable flag next to it", async () => {
        const server = await buildServer();
        const response = await server.inject({ method: "GET", url: "/login" });
        const session = byName(response.cookies, SESSION_COOKIE);
        const flag = byName(response.cookies, SESSION_FLAG_COOKIE);

        expect(session.value).toBe(response.json().token);
        expect(session).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
        expect(flag.value).toBe("1");
        expect(flag.httpOnly).toBeUndefined();
        expect(flag).toMatchObject({ sameSite: "Strict", path: "/" });
    });

    it("marks the cookies Secure only when the request came over https", async () => {
        const server = await buildServer();
        const plain = await server.inject({ method: "GET", url: "/login" });
        const tls = await server.inject({
            method: "GET",
            url: "/login",
            headers: { "x-forwarded-proto": "https" },
        });

        expect(byName(plain.cookies, SESSION_COOKIE).secure).toBeUndefined();
        expect(byName(plain.cookies, SESSION_FLAG_COOKIE).secure).toBeUndefined();
        expect(byName(tls.cookies, SESSION_COOKIE).secure).toBe(true);
        expect(byName(tls.cookies, SESSION_FLAG_COOKIE).secure).toBe(true);
    });
});

describe("clearSessionCookies", () => {
    it("expires both cookies", async () => {
        const server = await buildServer();
        const response = await server.inject({ method: "GET", url: "/logout" });

        for (const name of [SESSION_COOKIE, SESSION_FLAG_COOKIE]) {
            const cleared = byName(response.cookies, name);
            expect(cleared.value).toBe("");
            expect(cleared.maxAge).toBe(0);
        }
    });
});
