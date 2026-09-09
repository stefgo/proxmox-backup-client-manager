import type { ZodError } from "zod";

/**
 * Turns a Zod failure into the one sentence that goes into `{ error: … }`.
 *
 * The controllers that validated first used `error.issues[0].message` on its own, which
 * reads as "Invalid input: expected string, received undefined" and leaves the caller to
 * guess which of six fields it meant. Prefixing the path costs nothing and makes the
 * message actionable; where there is no path -- a whole body of the wrong type -- the
 * message stands alone, exactly as before.
 *
 * Only the first issue: the reply carries a single `error` string, and a caller fixing one
 * field at a time gets the next one on the next attempt.
 */
export function firstIssue(error: ZodError): string {
    const issue = error.issues[0];
    if (!issue) return "Invalid request body";
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
}
