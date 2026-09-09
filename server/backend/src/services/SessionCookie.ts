import type { FastifyReply, FastifyRequest } from "fastify";
import { appConfig } from "../config/AppConfig.js";

/**
 * The browser session, as two cookies.
 *
 * The JWT used to travel to the browser three times over: in the OIDC redirect's query
 * string, in `localStorage`, and again in the dashboard WebSocket URL. The first and third
 * are written to proxy and server access logs; the second is readable by any script that
 * gets a foothold on the page.
 *
 * So the token no longer reaches JavaScript at all — the BFF shape recommended by
 * *OAuth 2.0 for Browser-Based Apps*. The browser carries it automatically, including on
 * the WebSocket handshake, which is what let the query parameter disappear there too.
 */

/** Holds the JWT. httpOnly, so no script can read it — not even ours. */
export const SESSION_COOKIE = "pbcm_session";

/**
 * Carries no secret. It exists so the UI knows whether to render the login form without
 * having to fire a request first, and it is deliberately readable.
 */
export const SESSION_FLAG_COOKIE = "pbcm_auth";

/**
 * Turns the configured `jwtExpiresIn` into seconds for the cookie's `Max-Age`.
 *
 * The cookie must not outlive the token it carries: a browser holding a cookie the server
 * rejects looks logged in and fails on every action. Anything unparseable falls back to
 * the same 12 hours the config schema defaults to.
 */
function maxAgeSeconds(): number {
    const raw = appConfig.jwtExpiresIn;
    const match = /^(\d+)\s*([smhd])?$/.exec(raw.trim());
    if (!match) return 12 * 3600;

    const value = Number(match[1]);
    switch (match[2]) {
        case "s":
            return value;
        case "m":
            return value * 60;
        case "d":
            return value * 86400;
        case "h":
        default:
            return value * 3600;
    }
}

/**
 * Whether this response may mark its cookies `Secure`.
 *
 * Read from the request rather than hardcoded: `Secure` tells the browser to withhold the
 * cookie over plain HTTP, and plenty of installations run on http:// inside a home
 * network. Set unconditionally, those would log in successfully and then be rejected on
 * the very next request, with nothing in the UI to explain it. `trustProxy` is on, so this
 * sees the scheme the *browser* used, not the one behind a TLS-terminating proxy.
 */
function isSecureRequest(request: FastifyRequest): boolean {
    return request.protocol === "https";
}

/** Issues both cookies for a freshly authenticated user. */
export function setSessionCookies(
    request: FastifyRequest,
    reply: FastifyReply,
    token: string,
): void {
    const secure = isSecureRequest(request);
    const maxAge = maxAgeSeconds();

    reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        // strict rather than lax: every request in this application is same-origin
        // (the backend serves the SPA, and Vite proxies to it in development), so there
        // is no cross-site navigation that legitimately needs the session — which is
        // also what makes CSRF a non-issue here, together with the CORS origin:false.
        sameSite: "strict",
        secure,
        path: "/",
        maxAge,
    });

    reply.setCookie(SESSION_FLAG_COOKIE, "1", {
        httpOnly: false,
        sameSite: "strict",
        secure,
        path: "/",
        maxAge,
    });
}

/** Clears both cookies. The httpOnly one can only be removed from here. */
export function clearSessionCookies(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie(SESSION_FLAG_COOKIE, { path: "/" });
}
