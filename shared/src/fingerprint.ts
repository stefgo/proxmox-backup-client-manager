/**
 * Brings a certificate fingerprint into the form the database stores: lowercase hex with
 * colons, whitespace removed.
 *
 * Node reports `fingerprint256` in uppercase, so comparing raw values would report a
 * mismatch on every single probe. An operator pasting a fingerprint from the PBS web UI
 * brings its own spacing, which is the other half of the reason this exists.
 *
 * Shared rather than duplicated because all three surfaces compare fingerprints: the
 * backend against what it probed, the agent before a run, and the repository editor to
 * decide whether the field has been edited. Three copies of one normalisation is three
 * chances for two of them to disagree about what counts as equal.
 */
export function normalizeFingerprint(value?: string | null): string {
    return (value ?? "").replace(/\s+/g, "").toLowerCase();
}
