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
}

/**
 * Talks to the PBCM server while tolerating a self-signed certificate.
 *
 * This used to be `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"`, which switched off
 * certificate validation for the entire agent process and never switched it back on —
 * so every later TLS check, including the PBS certificate probe, would have silently
 * accepted anything. Scoping the exception to the requests that actually need it keeps
 * the rest of the process validating normally.
 */
export function requestAllowSelfSigned(
    url: string,
    options: SimpleRequestOptions = {},
): Promise<SimpleResponse> {
    const { method = "GET", body, headers = {}, timeoutMs = 10000 } = options;

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
                ...(isHttps ? { rejectUnauthorized: false } : {}),
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
