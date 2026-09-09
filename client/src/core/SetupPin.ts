import crypto from "crypto";
import { logger } from "@pbcm/shared/node";
import { config } from "./Config.js";

/**
 * The one-time PIN that guards `/api/register` on the agent's own Web UI.
 *
 * That endpoint decides which server this agent will trust from then on, and the caller
 * supplies both halves of it -- server URL and registration token. It listens on every
 * interface, and it cannot be restricted by `allowedNetworks`: that list holds the
 * *server's* address, while the operator opens the page from their own network, so
 * reusing it would lock out the very person it exists for (see Config.ts).
 *
 * So the check is a shared secret instead of an address. It is printed to the agent's log
 * on startup, where only someone who can already read the machine's journal
 * (`journalctl -u pbcm-client`, `docker logs`) can see it -- which is the same level of
 * access the registration itself grants.
 *
 * Deliberately not persisted to config.yaml. It is only meaningful while the agent has no
 * identity, it is regenerated on every start, and what is never written never has to be
 * cleaned up -- unlike `registrationSecret`, which needs deleteRegistrationSecret() for
 * exactly that reason.
 */

/**
 * No 0/O, no 1/I/L. The PIN is read off a terminal and typed into a browser on another
 * machine, so the two characters that are routinely confused there are simply absent.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP = 4;
const GROUPS = 2;

/** Failed attempts before the PIN is rotated, ending an online brute force. */
const MAX_ATTEMPTS = 5;

let currentPin: string | null = null;
let failedAttempts = 0;

function generate(): string {
    const groups: string[] = [];
    for (let g = 0; g < GROUPS; g++) {
        let group = "";
        for (let i = 0; i < GROUP; i++) {
            // randomInt over the alphabet length, not a byte modulo it: 256 is not a
            // multiple of 31, so the modulo would favour the first characters.
            group += ALPHABET[crypto.randomInt(ALPHABET.length)];
        }
        groups.push(group);
    }
    return groups.join("-");
}

/** Strips the cosmetic hyphen and case, so what the operator types matches what we made. */
function normalize(value: string): string {
    return value.trim().toUpperCase().replace(/-/g, "");
}

/** Returns the current PIN, creating one on first use. */
export function ensureSetupPin(): string {
    if (!currentPin) {
        currentPin = generate();
        failedAttempts = 0;
    }
    return currentPin;
}

/** Writes the PIN and the URL it belongs to into the log as one block an operator can spot. */
export function logSetupPin(): void {
    const pin = ensureSetupPin();
    const rule = "─".repeat(46);
    logger.info(rule);
    logger.info(`  Setup PIN:  ${pin}`);
    logger.info(`  Web UI:     http://<this-host>:${config.listenPort}/register`);
    logger.info("  The PIN is required to register this agent.");
    logger.info(rule);
}

/**
 * Checks a PIN presented by a caller.
 *
 * After MAX_ATTEMPTS failures the PIN is rotated and the new one logged. That ends an
 * online guessing attack without locking the operator out permanently -- they read the new
 * value from the same place they read the first one.
 */
export function verifySetupPin(input: string | undefined): boolean {
    if (!currentPin || !input) return false;

    const expected = Buffer.from(normalize(currentPin), "utf8");
    const actual = Buffer.from(normalize(input), "utf8");

    // timingSafeEqual throws on a length mismatch, so the lengths are compared first.
    // That leaks only the length of a fixed-format PIN, which is public anyway.
    const ok =
        expected.length === actual.length &&
        crypto.timingSafeEqual(expected, actual);

    if (ok) {
        failedAttempts = 0;
        return true;
    }

    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) {
        logger.warn(
            { attempts: failedAttempts },
            "Too many failed setup PIN attempts — rotating the PIN",
        );
        currentPin = null;
        failedAttempts = 0;
        logSetupPin();
    }
    return false;
}

/** Drops the PIN once an identity exists — there is nothing left for it to protect. */
export function clearSetupPin(): void {
    currentPin = null;
    failedAttempts = 0;
}
