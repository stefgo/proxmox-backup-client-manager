/**
 * Accepts "host:port" (also IPv6 in brackets) and rejects anything carrying a scheme,
 * path or credentials — the value is interpolated into `ws://<address>/ws/agent`, so a
 * stray slash would silently redirect the agent connection.
 *
 * Shared so the editor can reject an address before sending it: the field and the
 * endpoint that stores it have to agree on what a valid address is.
 */
export function normaliseTargetAddress(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed || /[\s/@\\?#]/.test(trimmed)) return undefined;
    try {
        const url = new URL(`ws://${trimmed}`);
        if (!url.hostname || !url.port) return undefined;
        return `${url.host}`;
    } catch {
        return undefined;
    }
}
