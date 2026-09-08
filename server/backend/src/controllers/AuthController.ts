import { FastifyReply, FastifyRequest } from "fastify";
import { LoginPayloadSchema } from "@pbcm/shared";
import { firstIssue } from "../utils/validation.js";
import { AuthService } from "../services/AuthService.js";
import { appConfig } from "../config/AppConfig.js";
import {
    setSessionCookies,
    clearSessionCookies,
} from "../services/SessionCookie.js";

export class AuthController {
    static async login(request: FastifyRequest, reply: FastifyReply) {
        // 400, not 401: a body without credentials is a malformed request, and answering
        // it with "invalid credentials" would tell a caller their input was considered.
        const parsed = LoginPayloadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: firstIssue(parsed.error) });
        }
        const { username, password } = parsed.data;
        const result = AuthService.checkLocalAuth(username, password);

        if (result.error) {
            return reply.code(401).send({ error: result.error });
        }

        const token = request.server.jwt.sign({ username, id: result.user.id });
        setSessionCookies(request, reply, token);
        // The token is deliberately not in the body any more: handing it to the page
        // would put it back into JavaScript's reach, which is the whole point of the
        // cookie. The response only says that the login worked.
        return { success: true };
    }

    /**
     * Ends the session. Needed as an endpoint at all because the session cookie is
     * httpOnly — the page cannot delete it itself.
     */
    static async logout(request: FastifyRequest, reply: FastifyReply) {
        clearSessionCookies(reply);
        return { success: true };
    }

    static async getConfig(request: FastifyRequest, reply: FastifyReply) {
        return AuthService.getAuthConfig();
    }

    /**
     * Who the current session belongs to.
     *
     * The dashboard used to read this by base64-decoding the JWT in the browser. That
     * stopped being possible when the token moved into an httpOnly cookie — which is the
     * point of the cookie, and a good reason for the name to come from the server that
     * issued it rather than from a payload the page picks apart itself.
     */
    static async me(request: FastifyRequest, reply: FastifyReply) {
        const user = request.user as { username?: string; id?: number };
        return { username: user?.username ?? null, id: user?.id ?? null };
    }

    static async oidcLogin(request: FastifyRequest, reply: FastifyReply) {
        try {
            const url = await AuthService.generateOidcUrl();
            return reply.redirect(url);
        } catch (e: unknown) {
            return reply
                .code(404)
                .send({ error: e instanceof Error ? e.message : String(e) });
        }
    }

    static async oidcCallback(request: FastifyRequest, reply: FastifyReply) {
        try {
            // Reconstruct URL. helper needed?
            // Fastify request.url only gives path. Need host.
            // But we know redirect_uri from config.
            if (!appConfig.oidc || !appConfig.oidc.enabled) {
                throw new Error("OIDC is not configured or disabled");
            }
            const redirectUriObj = new URL(appConfig.oidc.redirect_uri);
            const currentUrl = new URL(request.url, redirectUriObj.origin);

            const user = await AuthService.handleOidcCallback(currentUrl);
            const token = request.server.jwt.sign({
                username: user.username,
                id: user.id,
            });

            // The token rides back in the cookie, not in the redirect target. As a query
            // parameter it was written into the browser history and into every proxy and
            // server access log on the way — and it stayed valid for its full lifetime.
            setSessionCookies(request, reply, token);
            return reply.redirect("/");
        } catch (e: unknown) {
            return reply
                .code(500)
                .send({
                    error:
                        "Authentication failed: " +
                        (e instanceof Error ? e.message : String(e)),
                });
        }
    }
}
