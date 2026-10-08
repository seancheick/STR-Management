import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Server-side request forgery guard for user-supplied iCal URLs.
 * Only https URLs whose host resolves exclusively to public addresses pass.
 * (A DNS answer can still change between this check and the fetch; fetchIcal
 * re-checks every redirect hop, which covers the common bypasses.)
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // not an IP at all: refuse rather than guess
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type HostResolver = (hostname: string) => Promise<string[]>;

const resolveAll: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((r) => r.address);

/** Throws with a user-readable message when the URL is not a safe public https URL. */
export async function assertPublicHttpsUrl(
  rawUrl: string,
  resolve: HostResolver = resolveAll,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid iCal URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Calendar URLs must start with https://.");
  }
  if (url.username || url.password) {
    throw new Error("Calendar URLs cannot contain a username or password.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => [] as string[]);
  if (addresses.length === 0) {
    throw new Error("Could not find that calendar host.");
  }
  if (addresses.some(isPrivateAddress)) {
    throw new Error("That calendar URL points to a private network address.");
  }
  return url;
}
