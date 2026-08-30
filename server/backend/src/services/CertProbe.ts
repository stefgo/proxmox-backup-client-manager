import tls from "node:tls";
import net from "node:net";
import { logger } from "../core/logger.js";

/** Default port of the PBS API, used when the base URL does not name one. */
const PBS_DEFAULT_PORT = 8007;

export interface CertProbeResult {
    /** A TLS handshake was completed at all — with or without a valid chain. */
    reachable: boolean;
    /** SHA256 fingerprint, normalized to lowercase hex with colons. */
    fingerprint?: string;
    /**
     * The certificate passed regular validation (trusted chain and matching hostname).
     * This is the only evidence that justifies adopting a measured fingerprint: it comes
     * from a CA, an authority independent of the fingerprint itself.
     */
    caValid: boolean;
    /** Expiry date, shown in the UI so an upcoming renewal is not a surprise. */
    notAfter?: string;
    error?: string;
}

/**
 * Brings a fingerprint into the form the database stores: lowercase hex with colons.
 * Node reports `fingerprint256` in uppercase, so comparing raw values would report a
 * mismatch on every single probe.
 */
export function normalizeFingerprint(value?: string | null): string {
    return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

interface HandshakeResult {
    fingerprint?: string;
    notAfter?: string;
}

function handshake(
    host: string,
    port: number,
    rejectUnauthorized: boolean,
    timeoutMs: number,
): Promise<HandshakeResult> {
    // SNI must not carry an IP literal (RFC 6066); Node warns today and will ignore it
    // later. Dropping it is harmless — the hostname check falls back to `host`.
    const isIpLiteral = net.isIP(host) !== 0;

    return new Promise((resolve, reject) => {
        const socket = tls.connect({
            host,
            port,
            ...(isIpLiteral ? {} : { servername: host }),
            rejectUnauthorized,
            timeout: timeoutMs,
        });

        const fail = (err: Error) => {
            socket.destroy();
            reject(err);
        };

        socket.once("secureConnect", () => {
            // Must be read before the socket is torn down.
            const cert = socket.getPeerCertificate();
            socket.end();
            resolve({
                fingerprint: normalizeFingerprint(cert?.fingerprint256),
                notAfter: cert?.valid_to,
            });
        });
        socket.once("timeout", () => fail(new Error("Zeitüberschreitung")));
        socket.once("error", fail);
    });
}

/**
 * Measures the TLS certificate of a PBS instance.
 *
 * Two attempts by design: the first one validates, and its success is what makes an
 * automatic adoption of the fingerprint permissible at all. Only if it fails do we
 * connect again without validation — purely to *observe* which certificate is being
 * served, never to trust it.
 */
export async function probeCertificate(
    baseUrl: string,
    timeoutMs = 5000,
): Promise<CertProbeResult> {
    let host: string;
    let port: number;

    try {
        const url = new URL(baseUrl);
        host = url.hostname;
        port = url.port ? Number(url.port) : PBS_DEFAULT_PORT;
    } catch {
        return {
            reachable: false,
            caValid: false,
            error: `Ungültige Repository-Adresse: ${baseUrl}`,
        };
    }

    try {
        const res = await handshake(host, port, true, timeoutMs);
        return {
            reachable: true,
            caValid: true,
            fingerprint: res.fingerprint,
            notAfter: res.notAfter,
        };
    } catch (validationError) {
        try {
            const res = await handshake(host, port, false, timeoutMs);
            return {
                reachable: true,
                caValid: false,
                fingerprint: res.fingerprint,
                notAfter: res.notAfter,
                error:
                    validationError instanceof Error
                        ? validationError.message
                        : String(validationError),
            };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            logger.debug({ host, port, error }, "Certificate probe failed");
            return { reachable: false, caValid: false, error };
        }
    }
}
