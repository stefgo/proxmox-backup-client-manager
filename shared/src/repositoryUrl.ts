export interface RepositoryEndpoint {
    host: string;
    port: number;
    protocol: string;
}

/**
 * Resolves the host and port a repository base URL points at.
 *
 * The port comes from the URL and nothing else: an explicit one is used, otherwise the
 * protocol default (443 for https, 80 for http). Reaching a PBS on its own API port
 * requires spelling that out — `https://pbs.example.com:8007`.
 *
 * Note that `URL` drops an explicitly written default port, so `https://host` and
 * `https://host:443` are indistinguishable here. They mean the same endpoint, which is
 * why that is harmless.
 */
export function parseRepositoryEndpoint(
    baseUrl: string,
): RepositoryEndpoint | undefined {
    try {
        const url = new URL(baseUrl);
        return {
            host: url.hostname,
            port: url.port
                ? Number(url.port)
                : url.protocol === "http:"
                  ? 80
                  : 443,
            protocol: url.protocol,
        };
    } catch {
        return undefined;
    }
}
