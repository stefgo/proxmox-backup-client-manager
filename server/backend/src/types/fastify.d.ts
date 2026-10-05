/**
 * Declaration merging for the plugins that add properties to Fastify's own types.
 *
 * `@fastify/jwt` types `request.user` as `unknown` until this interface says otherwise,
 * which is why the codebase used to reach for `request.user as any` at the one place that
 * reads it. The shape below is not a guess: it is what both `jwt.sign` calls in
 * `AuthController` put into the token, and the two must stay in step.
 *
 * `id` is a number because the `users` table declares it INTEGER AUTOINCREMENT — see the
 * note on `UserRow`. It arrives back from the token as a number, so comparisons against a
 * route parameter still have to bridge that gap themselves.
 *
 * `tv` is the user's `token_version` at signing time. `AuthService.isSessionCurrent` honours
 * a token only while it still matches the row -- that is how a session ends before it expires.
 */
import "@fastify/jwt";

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: { username: string; id: number; tv: number };
        // iat and exp are added by the signer, so a verified token carries them even though
        // the payload handed to sign() does not.
        user: { username: string; id: number; tv: number; iat?: number; exp?: number };
    }
}
