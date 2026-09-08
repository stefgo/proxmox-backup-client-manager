/**
 * IPv4 network matching, shared because three sides ask the same question: the backend
 * decides whether an agent may connect, the client agent decides whether the server may,
 * and the client editor warns before an operator stores a value that would lock its agent
 * out. A copy in any of them would be a second answer to one question.
 */

/**
 * Strips the IPv4-mapped IPv6 prefix. A dual-stack listener reports `::ffff:10.0.0.5` for
 * what is an IPv4 peer, and `ipToLong` would silently read that as 0 -- a wrong decision
 * rather than a failed one.
 */
function normaliseIp(ip: string): string {
    return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * Converts an IPv4 string to a 32-bit integer.
 */
function ipToLong(ip: string): number {
    const parts = ip.split(".");
    if (parts.length !== 4) return 0;
    return (
        ((parseInt(parts[0]) << 24) >>> 0) +
        ((parseInt(parts[1]) << 16) >>> 0) +
        ((parseInt(parts[2]) << 8) >>> 0) +
        (parseInt(parts[3]) >>> 0)
    );
}

/**
 * Checks if an IP address is within a CIDR range.
 * Supports IPv4.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
    const [range, bitsStr] = cidr.split("/");
    const bits = bitsStr ? parseInt(bitsStr) : 32;

    if (bits === 0) return true; // 0.0.0.0/0

    const ipLong = ipToLong(normaliseIp(ip));
    const rangeLong = ipToLong(range);

    const mask = (0xffffffff << (32 - bits)) >>> 0;

    return (ipLong & mask) === (rangeLong & mask);
}

/**
 * Checks if an IP address is in any of the provided networks (CIDR strings).
 * If networks list is empty, it defaults to allowing everything (0.0.0.0/0).
 */
export function isIpInNetworks(
    ip: string,
    networks: string[],
    defaultAllow = false,
): boolean {
    if (!networks || networks.length === 0) {
        return defaultAllow;
    }

    return networks.some((cidr) => isIpInCidr(ip, cidr));
}

/**
 * Whether an address is allowed by a single stored value -- one client's pin, not a list.
 *
 * The value is a single address for a client registered without one being specified, and
 * an IPv4 network for one whose registration token carried a network -- a machine on DHCP
 * is one address today and another tomorrow, and pinning it to the first was never the
 * intent, only the default.
 *
 * A value without a `/` keeps an exact comparison. `isIpInCidr` works on 32-bit integers
 * and maps everything it cannot parse -- every real IPv6 address -- to `0`, so routing a
 * plain address through it would make any two IPv6 clients match each other.
 *
 * Absent means the check is switched off for this client -- a choice, not an oversight:
 * it is what the client editor stores when the restriction is unticked, and what a
 * registration token without a network leaves behind. A machine whose address is handed
 * to it by its environment, a container on a bridge network being the usual case, has no
 * stable address to be held to, and pinning it to whichever one it had first turns the
 * check into a delayed outage rather than a guarantee.
 */
export function isIpAllowed(ip: string, allowed: string | null): boolean {
    if (!allowed) return true;
    return allowed.includes("/")
        ? isIpInCidr(ip, allowed)
        : allowed === normaliseIp(ip);
}
