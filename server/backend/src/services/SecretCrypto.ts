import crypto from "crypto";
import { appConfig, keySecretPersisted } from "../config/AppConfig.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_INFO = "pbcm-tunnel-secret";

/**
 * Derives the encryption key from tunnel.keySecret. Deliberately NOT derived from
 * jwtSecret: rotating the JWT secret must not make stored secrets unreadable.
 *
 * Despite its name, the key protects every secret the server stores, not only the SSH
 * keys of the tunnels: repository token secrets and the auth tokens of outbound clients
 * too. The name stayed because existing config.yaml files carry it. The HKDF info stays
 * as well -- changing it would make every stored value unreadable.
 */
function derivedKey(): Buffer {
    const secret = appConfig.tunnel?.keySecret;
    if (!secret) {
        throw new Error(
            "tunnel.keySecret is not configured — cannot handle stored secrets",
        );
    }
    return Buffer.from(
        crypto.hkdfSync("sha256", secret, "pbcm", KEY_INFO, 32),
    );
}

/**
 * Returns iv:tag:ciphertext, all hex encoded.
 *
 * Refuses while tunnel.keySecret exists only in memory: a value encrypted with it would be
 * lost on the next restart, and that loss would not show until then.
 */
export function encryptSecret(plain: string): string {
    if (!keySecretPersisted()) {
        throw new Error(
            "tunnel.keySecret was generated but could not be written to config.yaml — refusing to encrypt with a key that is lost on restart. Make config.yaml writable and restart the server.",
        );
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
    const parts = stored.split(":");
    if (parts.length !== 3) {
        throw new Error("Cannot decrypt a stored secret (malformed)");
    }
    const [ivHex, tagHex, dataHex] = parts;
    try {
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            derivedKey(),
            Buffer.from(ivHex, "hex"),
        );
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        return Buffer.concat([
            decipher.update(Buffer.from(dataHex, "hex")),
            decipher.final(),
        ]).toString("utf8");
    } catch {
        throw new Error(
            "Cannot decrypt a stored secret — was tunnel.keySecret changed? Store it again",
        );
    }
}
