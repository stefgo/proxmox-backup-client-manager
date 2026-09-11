import http from "node:http";
import https from "node:https";

export interface SimpleResponse {
    ok: boolean;
    status: number;
    text: string;
}

export interface SimpleRequestOptions {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    /**
     * Accept a certificate that does not validate (self-signed, wrong host name). Decided
     * per request rather than for the process -- see serverRequest.
     */
    allowSelfSigned: boolean;
}

/**
 * Talks to the PBCM server with the certificate check decided per call.
 *
 * This used to be `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"`, which switched off
 * certificate validation for the entire agent process and never switched it back on —
 * so every later TLS check, including the PBS certificate probe, would have silently
 * accepted anything. Scoping the exception to the requests that actually need it keeps
 * the rest of the process validating normally.
 *
 * Which requests need it is the operator's call (`allowSelfSignedCertificates`): the
 * registration exchanges the registration token for the auth token, and the WebSocket
 * carries that token, so both follow the same setting. Only the reachability check
 * tolerates any certificate, because it sends nothing and trusts nothing it receives.
 */
export function serverRequest(
    url: string,
    options: SimpleRequestOptions,
): Promise<SimpleResponse> {
    const {
        method = "GET",
        body,
        headers = {},
        timeoutMs = 10000,
        allowSelfSigned,
    } = options;

    return new Promise((resolve, reject) => {
        let target: URL;
        try {
            target = new URL(url);
        } catch (e) {
            reject(new Error(`Invalid server address: ${url}`));
            return;
        }

        const isHttps = target.protocol === "https:";
        const transport = isHttps ? https : http;

        const req = transport.request(
            target,
            {
                method,
                headers,
                // Only meaningful for https; ignored otherwise.
                ...(isHttps ? { rejectUnauthorized: !allowSelfSigned } : {}),
            },
            (res) => {
                let text = "";
                res.setEncoding("utf8");
                res.on("data", (chunk) => (text += chunk));
                res.on("end", () => {
                    const status = res.statusCode ?? 0;
                    resolve({ ok: status >= 200 && status < 300, status, text });
                });
            },
        );

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error("Timed out"));
        });
        req.on("error", reject);

        if (body) req.write(body);
        req.end();
    });
}

const CERTIFICATE_ERROR_CODES = new Set([
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** Whether an error is a failed certificate check, so the message can name the option. */
export function isCertificateError(err: unknown): boolean {
    const code = (err as { code?: unknown })?.code;
    return typeof code === "string" && CERTIFICATE_ERROR_CODES.has(code);
}
