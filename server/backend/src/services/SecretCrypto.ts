import crypto from "crypto";
import { appConfig } from "../config/AppConfig.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_INFO = "pbcm-tunnel-secret";

/**
 * Derives the encryption key from tunnel.keySecret. Deliberately NOT derived from
 * jwtSecret: rotating the JWT secret must not make stored SSH keys unreadable.
 */
function derivedKey(): Buffer {
    const secret = appConfig.tunnel?.keySecret;
    if (!secret) {
        throw new Error(
            "tunnel.keySecret is not configured — cannot handle tunnel credentials",
        );
    }
    return Buffer.from(
        crypto.hkdfSync("sha256", secret, "pbcm", KEY_INFO, 32),
    );
}

/** Returns iv:tag:ciphertext, all hex encoded. */
export function encryptSecret(plain: string): string {
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
        throw new Error("Tunnel-Credentials nicht entschlüsselbar (Formatfehler)");
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
            "Tunnel-Credentials nicht entschlüsselbar, bitte neu hinterlegen",
        );
    }
}
