import net from "node:net";
import tls, { type PeerCertificate, type TLSSocket } from "node:tls";

import { ScanProcessingError } from "../scans/scanLifecycle.ts";
import {
  assertSafeTargetUrl,
  normalizeUrl,
  UrlSafetyError,
} from "../security/urlSafety.ts";

export const SSL_TLS_CATEGORY = "SSL/TLS";

const USER_AGENT = "SMB-Security-Report-Generator/1.0";
const MAX_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DAY_IN_MS = 86_400_000;

type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type SslTlsFinding = {
  scanId: string;
  title: string;
  severity: FindingSeverity;
  category: typeof SSL_TLS_CATEGORY;
  owaspMapping: string;
  evidence: string;
  impact: string;
  fix: string;
  confidence: ConfidenceLevel;
};

export type SslTlsSummary = {
  httpsAvailable: boolean;
  httpRedirectsToHttps: boolean | null;
  certificateExists: boolean;
  certificateValid: boolean | null;
  expired: boolean | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiry: number | null;
  issuer: string | null;
  subject: string | null;
  subjectAltNames: string[];
  hostnameMatched: boolean | null;
  checkedAt: string;
  authorizationError: string | null;
  httpsError: string | null;
  httpRedirectStatusCode: number | null;
  httpRedirectFinalUrl: string | null;
};

export type ScanSslTlsInput = {
  scanId: string;
  targetUrl: string;
  normalizedUrl: string;
  rootDomain: string;
};

export type ScanSslTlsResult = {
  findings: SslTlsFinding[];
  sslSummary: SslTlsSummary;
};

type CertificateCheckResult = {
  authorizationError: string | null;
  certificateExists: boolean;
  certificateValid: boolean | null;
  daysUntilExpiry: number | null;
  expired: boolean | null;
  hostnameMatched: boolean | null;
  httpsAvailable: boolean;
  httpsError: string | null;
  issuer: string | null;
  subject: string | null;
  subjectAltNames: string[];
  validFrom: string | null;
  validTo: string | null;
};

type HttpRedirectCheckResult = {
  finalUrl: string | null;
  redirectsToHttps: boolean | null;
  statusCode: number | null;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type ScanSslTlsDependencies = {
  certificateChecker?: (input: {
    hostname: string;
    port: number;
    servername: string | undefined;
    timeoutMilliseconds: number;
    now: Date;
  }) => Promise<CertificateCheckResult>;
  fetch?: FetchLike;
  httpRedirectChecker?: (input: {
    httpUrl: string;
    maxRedirects: number;
    timeoutMilliseconds: number;
    validateSafeTarget: (url: string) => Promise<unknown>;
  }) => Promise<HttpRedirectCheckResult>;
  maxRedirects?: number;
  now?: () => Date;
  timeoutMilliseconds?: number;
  validateSafeTarget?: (url: string) => Promise<unknown>;
};

type CertificateName = Record<string, string | string[] | undefined>;

export function calculateDaysUntilExpiry(validTo: Date, now = new Date()) {
  return Math.ceil((validTo.getTime() - now.getTime()) / DAY_IN_MS);
}

function normalizeTimeout(timeoutMilliseconds?: number) {
  if (!timeoutMilliseconds || timeoutMilliseconds <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(timeoutMilliseconds, MAX_TIMEOUT_MS);
}

function normalizeRedirectLimit(maxRedirects?: number) {
  if (maxRedirects === undefined || maxRedirects < 0) {
    return DEFAULT_MAX_REDIRECTS;
  }

  return Math.min(maxRedirects, DEFAULT_MAX_REDIRECTS);
}

function createFinding(
  scanId: string,
  input: Omit<SslTlsFinding, "category" | "scanId">,
): SslTlsFinding {
  return {
    scanId,
    category: SSL_TLS_CATEGORY,
    ...input,
  };
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function forceProtocol(url: string, protocol: "http:" | "https:") {
  const parsed = new URL(normalizeUrl(url));
  parsed.protocol = protocol;

  return parsed.toString();
}

function getHttpsPort(url: URL) {
  if (url.port) {
    return Number(url.port);
  }

  return 443;
}

function parseCertificateDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatCertificateDate(date: Date | null) {
  return date ? date.toISOString() : null;
}

function formatCertificateName(name?: CertificateName) {
  if (!name) {
    return null;
  }

  const parts = Object.entries(name)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      Array.isArray(value) ? `${key}=${value.join(",")}` : `${key}=${value}`,
    );

  return parts.length > 0 ? parts.join(", ") : null;
}

function parseSubjectAltNames(subjectAltName?: string) {
  if (!subjectAltName) {
    return [];
  }

  return subjectAltName
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasCertificate(certificate: PeerCertificate) {
  return Object.keys(certificate).length > 0;
}

function getAuthorizationError(socket: TLSSocket) {
  const authorizationError = socket.authorizationError;

  if (!authorizationError) {
    return null;
  }

  return authorizationError instanceof Error
    ? authorizationError.message
    : String(authorizationError);
}

function buildCertificateCheckResult(
  socket: TLSSocket,
  hostname: string,
  now: Date,
): CertificateCheckResult {
  const certificate = socket.getPeerCertificate();
  const certificateExists = hasCertificate(certificate);
  const validFromDate = parseCertificateDate(certificate.valid_from);
  const validToDate = parseCertificateDate(certificate.valid_to);
  const daysUntilExpiry = validToDate
    ? calculateDaysUntilExpiry(validToDate, now)
    : null;
  const expired = daysUntilExpiry === null ? null : daysUntilExpiry < 0;
  const hostnameError = certificateExists
    ? tls.checkServerIdentity(hostname, certificate)
    : new Error("No peer certificate was provided.");
  const authorizationError = getAuthorizationError(socket);
  const hostnameMatched = certificateExists ? !hostnameError : null;
  const certificateValid =
    certificateExists && expired !== null && hostnameMatched !== null
      ? !authorizationError && !expired && hostnameMatched
      : null;

  return {
    authorizationError,
    certificateExists,
    certificateValid,
    daysUntilExpiry,
    expired,
    hostnameMatched,
    httpsAvailable: true,
    httpsError: null,
    issuer: formatCertificateName(certificate.issuer as CertificateName | undefined),
    subject: formatCertificateName(certificate.subject as CertificateName | undefined),
    subjectAltNames: parseSubjectAltNames(certificate.subjectaltname),
    validFrom: formatCertificateDate(validFromDate),
    validTo: formatCertificateDate(validToDate),
  };
}

function getSafeHttpsErrorMessage(error: unknown) {
  if (error instanceof UrlSafetyError || error instanceof ScanProcessingError) {
    return error.message;
  }

  return "HTTPS connection could not be established for the target host.";
}

function defaultCertificateChecker(input: {
  hostname: string;
  port: number;
  servername: string | undefined;
  timeoutMilliseconds: number;
  now: Date;
}) {
  return new Promise<CertificateCheckResult>((resolve) => {
    let settled = false;
    const socket = tls.connect({
      host: input.hostname,
      port: input.port,
      rejectUnauthorized: false,
      servername: input.servername,
      timeout: input.timeoutMilliseconds,
    });

    function finish(result: CertificateCheckResult) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.once("secureConnect", () => {
      finish(buildCertificateCheckResult(socket, input.hostname, input.now));
    });

    socket.once("timeout", () => {
      finish({
        authorizationError: null,
        certificateExists: false,
        certificateValid: null,
        daysUntilExpiry: null,
        expired: null,
        hostnameMatched: null,
        httpsAvailable: false,
        httpsError: "HTTPS connection timed out for the target host.",
        issuer: null,
        subject: null,
        subjectAltNames: [],
        validFrom: null,
        validTo: null,
      });
    });

    socket.once("error", () => {
      finish({
        authorizationError: null,
        certificateExists: false,
        certificateValid: null,
        daysUntilExpiry: null,
        expired: null,
        hostnameMatched: null,
        httpsAvailable: false,
        httpsError: "HTTPS connection could not be established for the target host.",
        issuer: null,
        subject: null,
        subjectAltNames: [],
        validFrom: null,
        validTo: null,
      });
    });
  });
}

async function fetchRedirect(url: string, signal: AbortSignal, fetcher: FetchLike) {
  const response = await fetcher(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    method: "HEAD",
    redirect: "manual",
    signal,
  });

  if (response.status === 405) {
    return fetcher(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      method: "GET",
      redirect: "manual",
      signal,
    });
  }

  return response;
}

async function cancelResponseBody(response: Response) {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // Redirect checks only need status and Location; body cleanup is best effort.
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function defaultHttpRedirectChecker(input: {
  fetcher: FetchLike;
  httpUrl: string;
  maxRedirects: number;
  timeoutMilliseconds: number;
  validateSafeTarget: (url: string) => Promise<unknown>;
}): Promise<HttpRedirectCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMilliseconds);
  let currentUrl = input.httpUrl;
  let lastStatusCode: number | null = null;

  try {
    for (let index = 0; index <= input.maxRedirects; index += 1) {
      await input.validateSafeTarget(currentUrl);

      const response = await fetchRedirect(
        currentUrl,
        controller.signal,
        input.fetcher,
      );
      const location = response.headers.get("location");
      lastStatusCode = response.status;
      await cancelResponseBody(response);

      if (response.status < 300 || response.status >= 400 || !location) {
        return {
          finalUrl: currentUrl,
          redirectsToHttps: false,
          statusCode: response.status,
        };
      }

      const nextUrl = normalizeUrl(new URL(location, currentUrl).toString());
      await input.validateSafeTarget(nextUrl);

      if (new URL(nextUrl).protocol === "https:") {
        return {
          finalUrl: nextUrl,
          redirectsToHttps: true,
          statusCode: response.status,
        };
      }

      currentUrl = nextUrl;
    }

    return {
      finalUrl: currentUrl,
      redirectsToHttps: false,
      statusCode: lastStatusCode,
    };
  } catch (error) {
    if (error instanceof UrlSafetyError || error instanceof ScanProcessingError) {
      throw error;
    }

    if (isAbortError(error)) {
      return {
        finalUrl: currentUrl,
        redirectsToHttps: null,
        statusCode: lastStatusCode,
      };
    }

    return {
      finalUrl: currentUrl,
      redirectsToHttps: null,
      statusCode: lastStatusCode,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createBaseSummary(checkedAt: string): SslTlsSummary {
  return {
    authorizationError: null,
    certificateExists: false,
    certificateValid: null,
    checkedAt,
    daysUntilExpiry: null,
    expired: null,
    hostnameMatched: null,
    httpRedirectFinalUrl: null,
    httpRedirectsToHttps: null,
    httpRedirectStatusCode: null,
    httpsAvailable: false,
    httpsError: null,
    issuer: null,
    subject: null,
    subjectAltNames: [],
    validFrom: null,
    validTo: null,
  };
}

export function analyzeSslTls(input: {
  scanId: string;
  sslSummary: SslTlsSummary;
}) {
  const findings: SslTlsFinding[] = [];
  const summary = input.sslSummary;

  if (!summary.httpsAvailable) {
    findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: "HTTPS connection could not be established for the target host.",
        fix: "Enable HTTPS on the target host with a trusted certificate.",
        impact:
          "Visitors may be unable to use encrypted transport, exposing traffic to interception or tampering.",
        owaspMapping: "Cryptographic Failures",
        severity: "HIGH",
        title: "HTTPS is not available",
      }),
    );
  }

  if (summary.httpRedirectsToHttps === false) {
    findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: "HTTP did not redirect to HTTPS.",
        fix: "Redirect all HTTP requests to the equivalent HTTPS URL.",
        impact:
          "Visitors who start on HTTP may remain on an unencrypted connection.",
        owaspMapping: "Cryptographic Failures / Security Misconfiguration",
        severity: "MEDIUM",
        title: "HTTP does not redirect to HTTPS",
      }),
    );
  }

  if (summary.expired === true) {
    findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: `Certificate expired on ${formatDateOnly(summary.validTo) ?? "the reported expiry date"}.`,
        fix: "Renew and deploy a trusted TLS certificate for the target host.",
        impact:
          "Browsers may block the site or show certificate warnings, reducing user trust and encrypted transport reliability.",
        owaspMapping: "Cryptographic Failures",
        severity: "HIGH",
        title: "TLS certificate is expired",
      }),
    );
  } else if (
    summary.daysUntilExpiry !== null &&
    summary.validTo &&
    summary.daysUntilExpiry <= 14
  ) {
    findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: `Certificate expires in ${summary.daysUntilExpiry} days on ${formatDateOnly(summary.validTo)}.`,
        fix: "Renew the TLS certificate before it expires.",
        impact:
          "An imminent certificate expiry can cause browser warnings or site outages if renewal is missed.",
        owaspMapping: "Cryptographic Failures",
        severity: "MEDIUM",
        title: "TLS certificate expires within 14 days",
      }),
    );
  } else if (
    summary.daysUntilExpiry !== null &&
    summary.validTo &&
    summary.daysUntilExpiry <= 30
  ) {
    findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: `Certificate expires in ${summary.daysUntilExpiry} days on ${formatDateOnly(summary.validTo)}.`,
        fix: "Plan certificate renewal before the expiry date.",
        impact:
          "The certificate is approaching expiry and should be renewed soon to avoid service disruption.",
        owaspMapping: "Cryptographic Failures",
        severity: "LOW",
        title: "TLS certificate expires within 30 days",
      }),
    );
  }

  if (summary.hostnameMatched === false) {
    findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: "Certificate subject does not match the requested hostname.",
        fix: "Install a certificate whose SAN or common name covers the requested hostname.",
        impact:
          "Browsers may reject the certificate because it is not valid for the requested host.",
        owaspMapping: "Cryptographic Failures",
        severity: "HIGH",
        title: "TLS certificate hostname mismatch",
      }),
    );
  }

  return findings;
}

export async function scanSslTls(
  input: ScanSslTlsInput,
  dependencies: ScanSslTlsDependencies = {},
): Promise<ScanSslTlsResult> {
  const now = dependencies.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const timeoutMilliseconds = normalizeTimeout(dependencies.timeoutMilliseconds);
  const maxRedirects = normalizeRedirectLimit(dependencies.maxRedirects);
  const validateSafeTarget = dependencies.validateSafeTarget ?? assertSafeTargetUrl;
  const normalizedTargetUrl = normalizeUrl(input.normalizedUrl || input.targetUrl);
  const httpsUrl = forceProtocol(normalizedTargetUrl, "https:");
  const httpUrl = forceProtocol(normalizedTargetUrl, "http:");
  const parsedHttpsUrl = new URL(httpsUrl);
  const summary = createBaseSummary(checkedAt);
  const certificateChecker =
    dependencies.certificateChecker ?? defaultCertificateChecker;

  await validateSafeTarget(httpsUrl);

  const certificateResult = await certificateChecker({
    hostname: parsedHttpsUrl.hostname,
    now,
    port: getHttpsPort(parsedHttpsUrl),
    servername: net.isIP(parsedHttpsUrl.hostname)
      ? undefined
      : parsedHttpsUrl.hostname,
    timeoutMilliseconds,
  }).catch((error: unknown): CertificateCheckResult => ({
    authorizationError: null,
    certificateExists: false,
    certificateValid: null,
    daysUntilExpiry: null,
    expired: null,
    hostnameMatched: null,
    httpsAvailable: false,
    httpsError: getSafeHttpsErrorMessage(error),
    issuer: null,
    subject: null,
    subjectAltNames: [],
    validFrom: null,
    validTo: null,
  }));

  Object.assign(summary, certificateResult);

  const redirectChecker = dependencies.httpRedirectChecker;
  const redirectResult = redirectChecker
    ? await redirectChecker({
        httpUrl,
        maxRedirects,
        timeoutMilliseconds,
        validateSafeTarget,
      })
    : await defaultHttpRedirectChecker({
        fetcher: dependencies.fetch ?? fetch,
        httpUrl,
        maxRedirects,
        timeoutMilliseconds,
        validateSafeTarget,
      });

  summary.httpRedirectFinalUrl = redirectResult.finalUrl;
  summary.httpRedirectsToHttps = redirectResult.redirectsToHttps;
  summary.httpRedirectStatusCode = redirectResult.statusCode;

  return {
    findings: analyzeSslTls({
      scanId: input.scanId,
      sslSummary: summary,
    }),
    sslSummary: summary,
  };
}
