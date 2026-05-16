import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const REDIRECT_TIMEOUT_MS = 10_000;
export const TOO_MANY_REDIRECTS_REASON = "TOO_MANY_REDIRECTS";
export const TOO_MANY_REDIRECTS_MESSAGE =
  "This target redirects too many times to scan safely. Try scanning the main website domain instead, such as google.com or www.google.com.";

export type UrlSafetyErrorCode = typeof TOO_MANY_REDIRECTS_REASON;

export class UrlSafetyError extends Error {
  code?: UrlSafetyErrorCode;

  constructor(message: string, options?: { code?: UrlSafetyErrorCode }) {
    super(message);
    this.name = "UrlSafetyError";
    this.code = options?.code;
  }
}

function assertSafeProtocol(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError("Only http and https URLs are allowed.");
  }
}

function parseIpv4(ip: string) {
  const parts = ip.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => Number(part));

  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null;
  }

  return bytes;
}

function normalizeIpv6(ip: string) {
  return ip.toLowerCase().replace(/^\[|\]$/g, "");
}

export function normalizeUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new UrlSafetyError("Enter a website URL.");
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);

  assertSafeProtocol(url);

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  const normalized = url.toString();

  if (url.pathname === "/" && !url.search) {
    return normalized.replace(/\/$/, "");
  }

  return normalized;
}

export function extractRootDomain(url: string) {
  const hostname = new URL(url).hostname.toLowerCase();

  if (net.isIP(hostname)) {
    return hostname;
  }

  const labels = hostname.split(".").filter(Boolean);

  if (labels.length <= 2) {
    return hostname;
  }

  return labels.slice(-2).join(".");
}

export function validateHttpUrl(url: string) {
  const parsed = new URL(url);
  assertSafeProtocol(parsed);

  if (!parsed.hostname) {
    throw new UrlSafetyError("URL must include a hostname.");
  }

  return parsed;
}

export async function resolveHostname(hostname: string) {
  if (net.isIP(hostname)) {
    return [hostname];
  }

  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  return addresses.map((address) => address.address);
}

export function isLoopbackIp(ip: string) {
  const version = net.isIP(ip);

  if (version === 4) {
    const bytes = parseIpv4(ip);
    return bytes?.[0] === 127;
  }

  const normalized = normalizeIpv6(ip);
  return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
}

export function isLinkLocalIp(ip: string) {
  const version = net.isIP(ip);

  if (version === 4) {
    const bytes = parseIpv4(ip);
    return bytes?.[0] === 169 && bytes[1] === 254;
  }

  const normalized = normalizeIpv6(ip);
  return /^fe[89ab]:/i.test(normalized) || normalized.startsWith("fe80:");
}

export function isMetadataIp(ip: string) {
  return ip === "169.254.169.254";
}

export function isPrivateIp(ip: string) {
  const version = net.isIP(ip);

  if (version === 4) {
    const bytes = parseIpv4(ip);

    if (!bytes) {
      return false;
    }

    const [first, second] = bytes;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (version === 6) {
    const normalized = normalizeIpv6(ip);

    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/i.test(normalized) ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:169.254.")
    );
  }

  return false;
}

export function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "[::1]" ||
    normalized === "::1"
  );
}

function assertSafeIp(ip: string) {
  if (
    isMetadataIp(ip) ||
    isLoopbackIp(ip) ||
    isLinkLocalIp(ip) ||
    isPrivateIp(ip)
  ) {
    throw new UrlSafetyError("This target resolves to an internal or unsafe address.");
  }
}

export async function assertSafeTargetUrl(url: string) {
  const parsed = validateHttpUrl(url);

  if (isBlockedHostname(parsed.hostname)) {
    throw new UrlSafetyError("Local or internal hostnames are not allowed.");
  }

  const addresses = await resolveHostname(parsed.hostname);

  if (addresses.length === 0) {
    throw new UrlSafetyError("Unable to resolve the target hostname.");
  }

  for (const address of addresses) {
    assertSafeIp(address);
  }

  return true;
}

async function fetchRedirect(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    signal,
  });

  if (response.status === 405) {
    return fetch(url, {
      method: "GET",
      redirect: "manual",
      signal,
    });
  }

  return response;
}

export async function checkRedirectSafety(url: string) {
  let currentUrl = normalizeUrl(url);

  await assertSafeTargetUrl(currentUrl);

  for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REDIRECT_TIMEOUT_MS);

    try {
      const response = await fetchRedirect(currentUrl, controller.signal);

      if (response.status < 300 || response.status >= 400) {
        return true;
      }

      const location = response.headers.get("location");

      if (!location) {
        return true;
      }

      currentUrl = normalizeUrl(new URL(location, currentUrl).toString());
      await assertSafeTargetUrl(currentUrl);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new UrlSafetyError(TOO_MANY_REDIRECTS_MESSAGE, {
    code: TOO_MANY_REDIRECTS_REASON,
  });
}
