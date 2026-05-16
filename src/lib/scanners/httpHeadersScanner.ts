import { ScanProcessingError } from "../scans/scanLifecycle.ts";
import {
  assertSafeTargetUrl,
  normalizeUrl,
  UrlSafetyError,
} from "../security/urlSafety.ts";

export const HTTP_SECURITY_HEADERS_CATEGORY = "HTTP Security Headers";

export const HTTP_SECURITY_HEADER_NAMES = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
  "Cross-Origin-Embedder-Policy",
] as const;

const MAX_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MIN_HSTS_MAX_AGE_SECONDS = 15_552_000;
const USER_AGENT = "SMB-Security-Report-Generator/1.0";

type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type HttpSecurityHeaderName = (typeof HTTP_SECURITY_HEADER_NAMES)[number];
export type HeaderCheckStatus = "Present" | "Missing" | "Weak" | "Not checked";

export type HttpHeaderFinding = {
  scanId: string;
  title: string;
  severity: FindingSeverity;
  category: typeof HTTP_SECURITY_HEADERS_CATEGORY;
  owaspMapping: string;
  evidence: string;
  impact: string;
  fix: string;
  confidence: ConfidenceLevel;
};

export type HeaderSummaryItem = {
  name: HttpSecurityHeaderName;
  status: HeaderCheckStatus;
  findingTitles: string[];
  note?: string;
};

export type ScanHttpSecurityHeadersInput = {
  scanId: string;
  targetUrl?: string;
  normalizedUrl?: string;
};

export type ScanHttpSecurityHeadersResult = {
  findings: HttpHeaderFinding[];
  headerSummary: HeaderSummaryItem[];
  statusCode: number;
  finalUrl: string;
  redirectsFollowed: number;
};

type HeaderRecord = Record<string, string | string[] | null | undefined>;
type HeadersLike = Pick<Headers, "get" | "forEach">;
type HeaderSource = HeadersLike | HeaderRecord;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type ScanHttpSecurityHeadersDependencies = {
  fetch?: FetchLike;
  validateSafeTarget?: (url: string) => Promise<unknown>;
  timeoutMilliseconds?: number;
  maxRedirects?: number;
};

type HomepageResponse = {
  finalUrl: string;
  headers: Record<string, string>;
  redirectsFollowed: number;
  statusCode: number;
};

type CspDirective = {
  name: string;
  sources: string[];
};

function hasHeaderGet(headers: HeaderSource): headers is HeadersLike {
  return typeof (headers as { get?: unknown }).get === "function";
}

function hasHeaderForEach(headers: HeaderSource): headers is HeadersLike {
  return typeof (headers as { forEach?: unknown }).forEach === "function";
}

export function getHeaderValue(headers: HeaderSource, headerName: string) {
  if (hasHeaderGet(headers)) {
    const value = headers.get(headerName);

    if (value !== null) {
      return value;
    }
  }

  const normalizedName = headerName.toLowerCase();

  if (hasHeaderForEach(headers)) {
    let foundValue: string | null = null;

    headers.forEach((value, key) => {
      if (key.toLowerCase() === normalizedName) {
        foundValue = value;
      }
    });

    return foundValue;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== normalizedName) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    return Array.isArray(value) ? value.join(", ") : value;
  }

  return null;
}

function headersToRecord(headers: Headers) {
  const record: Record<string, string> = {};

  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });

  return record;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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

async function cancelResponseBody(response: Response) {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // The scanner only needs response headers; body cancellation is best effort.
  }
}

async function fetchHomepageResponse(
  startUrl: string,
  dependencies: Required<
    Pick<ScanHttpSecurityHeadersDependencies, "fetch" | "validateSafeTarget">
  > &
    Pick<
      ScanHttpSecurityHeadersDependencies,
      "maxRedirects" | "timeoutMilliseconds"
    >,
): Promise<HomepageResponse> {
  const timeoutMilliseconds = normalizeTimeout(dependencies.timeoutMilliseconds);
  const maxRedirects = normalizeRedirectLimit(dependencies.maxRedirects);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  let currentUrl = startUrl;

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      await dependencies.validateSafeTarget(currentUrl);

      const response = await dependencies.fetch(currentUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": USER_AGENT,
        },
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });

      const statusCode = response.status;
      const location = response.headers.get("location");
      const headers = headersToRecord(response.headers);
      await cancelResponseBody(response);

      if (statusCode >= 300 && statusCode < 400 && location) {
        if (redirectCount >= maxRedirects) {
          throw new ScanProcessingError(
            "HTTP headers scanner stopped after too many redirects.",
          );
        }

        currentUrl = normalizeUrl(new URL(location, currentUrl).toString());
        continue;
      }

      return {
        finalUrl: currentUrl,
        headers,
        redirectsFollowed: redirectCount,
        statusCode,
      };
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new ScanProcessingError(
        "HTTP headers scanner timed out while fetching the target homepage.",
      );
    }

    if (error instanceof ScanProcessingError || error instanceof UrlSafetyError) {
      throw error;
    }

    throw new ScanProcessingError(
      "HTTP headers scanner could not fetch the target homepage safely.",
    );
  } finally {
    clearTimeout(timeout);
  }

  throw new ScanProcessingError(
    "HTTP headers scanner stopped after too many redirects.",
  );
}

function createFinding(
  scanId: string,
  input: Omit<HttpHeaderFinding, "category" | "scanId">,
): HttpHeaderFinding {
  return {
    scanId,
    category: HTTP_SECURITY_HEADERS_CATEGORY,
    ...input,
  };
}

function createMissingHeaderFinding(
  scanId: string,
  headerName: HttpSecurityHeaderName,
  severity: FindingSeverity,
  confidence: ConfidenceLevel,
  owaspMapping = "Security Misconfiguration",
) {
  return createFinding(scanId, {
    confidence,
    evidence: `${headerName} header was not present in the HTTP response.`,
    fix: `Add a ${headerName} response header with a policy appropriate for the site.`,
    impact:
      "Browsers receive less guidance for enforcing this defensive control on visitors.",
    owaspMapping,
    severity,
    title: `Missing ${headerName} header`,
  });
}

function parseCspDirectives(value: string): CspDirective[] {
  return value
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      const [name, ...sources] = directive.split(/\s+/);

      return {
        name: name.toLowerCase(),
        sources,
      };
    });
}

function findDirectiveWithToken(directives: CspDirective[], token: string) {
  const normalizedToken = token.toLowerCase();
  const quotedToken = `'${normalizedToken}'`;

  return directives.find((directive) =>
    directive.sources.some((source) => {
      const normalizedSource = source.toLowerCase();

      return (
        normalizedSource === normalizedToken || normalizedSource === quotedToken
      );
    }),
  );
}

function parseHstsDirectives(value: string) {
  const directives = new Map<string, string | true>();

  for (const directive of value.split(";")) {
    const trimmed = directive.trim();

    if (!trimmed) {
      continue;
    }

    const [rawName, ...rawValue] = trimmed.split("=");
    const name = rawName.trim().toLowerCase();
    const directiveValue = rawValue.join("=").trim();

    directives.set(name, directiveValue || true);
  }

  return directives;
}

function addFinding(
  finding: HttpHeaderFinding,
  headerName: HttpSecurityHeaderName,
  status: Exclude<HeaderCheckStatus, "Present" | "Not checked">,
  state: {
    dedupeKeys: Set<string>;
    findings: HttpHeaderFinding[];
    summaryByHeader: Map<HttpSecurityHeaderName, HeaderSummaryItem>;
  },
) {
  const dedupeKey = `${headerName}:${finding.title}`;

  if (state.dedupeKeys.has(dedupeKey)) {
    return;
  }

  state.dedupeKeys.add(dedupeKey);
  state.findings.push(finding);

  const summary = state.summaryByHeader.get(headerName);

  if (!summary) {
    return;
  }

  summary.findingTitles.push(finding.title);

  if (status === "Missing") {
    summary.status = "Missing";
    return;
  }

  if (summary.status !== "Missing") {
    summary.status = "Weak";
  }
}

function isHttpsUrl(url: string) {
  return new URL(url).protocol === "https:";
}

function buildInitialSummary(
  finalUrl: string,
  headers: HeaderSource,
): Map<HttpSecurityHeaderName, HeaderSummaryItem> {
  const isHttps = isHttpsUrl(finalUrl);
  const summary = new Map<HttpSecurityHeaderName, HeaderSummaryItem>();

  for (const headerName of HTTP_SECURITY_HEADER_NAMES) {
    const value = getHeaderValue(headers, headerName);
    const hstsNotApplicable =
      headerName === "Strict-Transport-Security" && !isHttps && !value;

    summary.set(headerName, {
      findingTitles: [],
      name: headerName,
      note: hstsNotApplicable ? "Only evaluated on HTTPS responses." : undefined,
      status: hstsNotApplicable ? "Not checked" : value ? "Present" : "Missing",
    });
  }

  return summary;
}

export function analyzeHttpSecurityHeaders(input: {
  finalUrl: string;
  headers: HeaderSource;
  scanId: string;
}) {
  const findings: HttpHeaderFinding[] = [];
  const summaryByHeader = buildInitialSummary(input.finalUrl, input.headers);
  const dedupeKeys = new Set<string>();
  const state = {
    dedupeKeys,
    findings,
    summaryByHeader,
  };

  const contentSecurityPolicy = getHeaderValue(
    input.headers,
    "Content-Security-Policy",
  );
  const strictTransportSecurity = getHeaderValue(
    input.headers,
    "Strict-Transport-Security",
  );
  const xFrameOptions = getHeaderValue(input.headers, "X-Frame-Options");
  const xContentTypeOptions = getHeaderValue(
    input.headers,
    "X-Content-Type-Options",
  );
  const referrerPolicy = getHeaderValue(input.headers, "Referrer-Policy");
  const permissionsPolicy = getHeaderValue(input.headers, "Permissions-Policy");
  const crossOriginOpenerPolicy = getHeaderValue(
    input.headers,
    "Cross-Origin-Opener-Policy",
  );
  const crossOriginResourcePolicy = getHeaderValue(
    input.headers,
    "Cross-Origin-Resource-Policy",
  );
  const crossOriginEmbedderPolicy = getHeaderValue(
    input.headers,
    "Cross-Origin-Embedder-Policy",
  );

  if (!contentSecurityPolicy) {
    addFinding(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence:
          "Content-Security-Policy header was not present in the HTTP response.",
        fix: "Add a Content-Security-Policy that starts restrictive and explicitly allows only required sources.",
        impact:
          "Without a CSP, browsers have less guidance to limit script, style, and content sources if injection occurs.",
        owaspMapping: "Security Misconfiguration",
        severity: "MEDIUM",
        title: "Missing Content-Security-Policy header",
      }),
      "Content-Security-Policy",
      "Missing",
      state,
    );
  } else {
    const directives = parseCspDirectives(contentSecurityPolicy);
    const unsafeInline = findDirectiveWithToken(directives, "unsafe-inline");
    const unsafeEval = findDirectiveWithToken(directives, "unsafe-eval");
    const wildcardDirective = findDirectiveWithToken(directives, "*");

    if (unsafeInline) {
      addFinding(
        createFinding(input.scanId, {
          confidence: "MEDIUM",
          evidence: `Content-Security-Policy directive "${unsafeInline.name}" contains "unsafe-inline".`,
          fix: "Move inline scripts and styles to external files or use nonces or hashes for required inline code.",
          impact:
            "A relaxed CSP directive may reduce the browser's ability to limit injected inline content.",
          owaspMapping: "Security Misconfiguration",
          severity: "LOW",
          title: "Content-Security-Policy contains unsafe-inline",
        }),
        "Content-Security-Policy",
        "Weak",
        state,
      );
    }

    if (unsafeEval) {
      addFinding(
        createFinding(input.scanId, {
          confidence: "HIGH",
          evidence: `Content-Security-Policy directive "${unsafeEval.name}" contains "unsafe-eval".`,
          fix: "Remove the need for dynamic JavaScript evaluation and drop unsafe-eval from the CSP.",
          impact:
            "Allowing unsafe-eval can make script injection issues easier to exploit.",
          owaspMapping: "Security Misconfiguration",
          severity: "MEDIUM",
          title: "Content-Security-Policy contains unsafe-eval",
        }),
        "Content-Security-Policy",
        "Weak",
        state,
      );
    }

    if (wildcardDirective) {
      addFinding(
        createFinding(input.scanId, {
          confidence: "MEDIUM",
          evidence: `Content-Security-Policy directive "${wildcardDirective.name}" contains wildcard "*".`,
          fix: "Replace broad wildcard sources with the specific origins required by the application.",
          impact:
            "CSP contains a relaxed directive that may allow content from more origins than needed.",
          owaspMapping: "Security Misconfiguration",
          severity: "LOW",
          title: "Content-Security-Policy contains a broad wildcard source",
        }),
        "Content-Security-Policy",
        "Weak",
        state,
      );
    }
  }

  if (isHttpsUrl(input.finalUrl)) {
    if (!strictTransportSecurity) {
      addFinding(
        createFinding(input.scanId, {
          confidence: "HIGH",
          evidence:
            "Strict-Transport-Security header was not present on an HTTPS response.",
          fix: "Add Strict-Transport-Security with a max-age of at least 15552000 seconds after verifying HTTPS works across the site.",
          impact:
            "HTTPS sites without HSTS may be more exposed to protocol downgrade and cookie leakage risks.",
          owaspMapping: "Cryptographic Failures / Security Misconfiguration",
          severity: "MEDIUM",
          title: "Missing Strict-Transport-Security header",
        }),
        "Strict-Transport-Security",
        "Missing",
        state,
      );
    } else {
      const directives = parseHstsDirectives(strictTransportSecurity);
      const maxAgeValue = directives.get("max-age");
      const maxAge =
        typeof maxAgeValue === "string" ? Number(maxAgeValue) : Number.NaN;

      if (!Number.isFinite(maxAge)) {
        addFinding(
          createFinding(input.scanId, {
            confidence: "HIGH",
            evidence:
              "Strict-Transport-Security max-age directive was not present or was invalid.",
            fix: "Set a numeric max-age directive, for example max-age=15552000.",
            impact:
              "Browsers may ignore an HSTS policy that does not include a valid max-age directive.",
            owaspMapping: "Cryptographic Failures / Security Misconfiguration",
            severity: "LOW",
            title: "Strict-Transport-Security max-age is invalid",
          }),
          "Strict-Transport-Security",
          "Weak",
          state,
        );
      } else if (maxAge < MIN_HSTS_MAX_AGE_SECONDS) {
        addFinding(
          createFinding(input.scanId, {
            confidence: "HIGH",
            evidence: `Strict-Transport-Security max-age was ${maxAge}, below the expected ${MIN_HSTS_MAX_AGE_SECONDS} seconds.`,
            fix: "Increase max-age to at least 15552000 seconds after confirming HTTPS is stable.",
            impact:
              "A short HSTS duration gives browsers a smaller window of enforced HTTPS protection.",
            owaspMapping: "Cryptographic Failures / Security Misconfiguration",
            severity: "LOW",
            title: "Strict-Transport-Security max-age is short",
          }),
          "Strict-Transport-Security",
          "Weak",
          state,
        );
      }

      if (!directives.has("includesubdomains")) {
        addFinding(
          createFinding(input.scanId, {
            confidence: "HIGH",
            evidence:
              "Strict-Transport-Security header did not include includeSubDomains.",
            fix: "Add includeSubDomains after verifying every subdomain supports HTTPS.",
            impact:
              "Subdomains may not receive the same browser-enforced HTTPS protection.",
            owaspMapping: "Cryptographic Failures / Security Misconfiguration",
            severity: "INFO",
            title: "Strict-Transport-Security does not include subdomains",
          }),
          "Strict-Transport-Security",
          "Weak",
          state,
        );
      }

      if (!directives.has("preload")) {
        addFinding(
          createFinding(input.scanId, {
            confidence: "MEDIUM",
            evidence: "Strict-Transport-Security header did not include preload.",
            fix: "Consider preload only after meeting browser preload list requirements.",
            impact:
              "The site is not declaring intent for browser preload lists; this is optional and should be evaluated carefully.",
            owaspMapping: "Cryptographic Failures / Security Misconfiguration",
            severity: "INFO",
            title: "Strict-Transport-Security preload is not declared",
          }),
          "Strict-Transport-Security",
          "Weak",
          state,
        );
      }
    }
  }

  if (!xFrameOptions) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "X-Frame-Options",
        "LOW",
        "HIGH",
      ),
      "X-Frame-Options",
      "Missing",
      state,
    );
  } else if (!["deny", "sameorigin"].includes(xFrameOptions.trim().toLowerCase())) {
    addFinding(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: `X-Frame-Options value was "${xFrameOptions}", expected "DENY" or "SAMEORIGIN".`,
        fix: "Set X-Frame-Options to DENY or SAMEORIGIN unless framing is intentionally required.",
        impact:
          "A weak frame policy may leave pages more exposed to clickjacking in older browser contexts.",
        owaspMapping: "Security Misconfiguration",
        severity: "LOW",
        title: "X-Frame-Options has a weak value",
      }),
      "X-Frame-Options",
      "Weak",
      state,
    );
  }

  if (!xContentTypeOptions) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "X-Content-Type-Options",
        "LOW",
        "HIGH",
      ),
      "X-Content-Type-Options",
      "Missing",
      state,
    );
  } else if (xContentTypeOptions.trim().toLowerCase() !== "nosniff") {
    addFinding(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: `X-Content-Type-Options value was "${xContentTypeOptions}", expected "nosniff".`,
        fix: "Set X-Content-Type-Options to nosniff.",
        impact:
          "Browsers may try to infer content types, which can increase exposure to content sniffing issues.",
        owaspMapping: "Security Misconfiguration",
        severity: "LOW",
        title: "X-Content-Type-Options has a weak value",
      }),
      "X-Content-Type-Options",
      "Weak",
      state,
    );
  }

  if (!referrerPolicy) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "Referrer-Policy",
        "LOW",
        "HIGH",
      ),
      "Referrer-Policy",
      "Missing",
      state,
    );
  } else {
    const policies = referrerPolicy
      .toLowerCase()
      .split(",")
      .map((policy) => policy.trim());

    if (policies.includes("unsafe-url")) {
      addFinding(
        createFinding(input.scanId, {
          confidence: "HIGH",
          evidence: 'Referrer-Policy included "unsafe-url".',
          fix: "Use a stricter policy such as strict-origin-when-cross-origin unless full URL referrers are required.",
          impact:
            "Full URLs may be sent as referrers to other origins, which can expose sensitive paths or query strings.",
          owaspMapping: "Security Misconfiguration",
          severity: "LOW",
          title: "Referrer-Policy uses unsafe-url",
        }),
        "Referrer-Policy",
        "Weak",
        state,
      );
    }
  }

  if (!permissionsPolicy) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "Permissions-Policy",
        "LOW",
        "MEDIUM",
      ),
      "Permissions-Policy",
      "Missing",
      state,
    );
  }

  if (!crossOriginOpenerPolicy) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "Cross-Origin-Opener-Policy",
        "INFO",
        "MEDIUM",
      ),
      "Cross-Origin-Opener-Policy",
      "Missing",
      state,
    );
  }

  if (!crossOriginResourcePolicy) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "Cross-Origin-Resource-Policy",
        "INFO",
        "MEDIUM",
      ),
      "Cross-Origin-Resource-Policy",
      "Missing",
      state,
    );
  }

  if (!crossOriginEmbedderPolicy) {
    addFinding(
      createMissingHeaderFinding(
        input.scanId,
        "Cross-Origin-Embedder-Policy",
        "INFO",
        "MEDIUM",
      ),
      "Cross-Origin-Embedder-Policy",
      "Missing",
      state,
    );
  }

  return {
    findings,
    headerSummary: HTTP_SECURITY_HEADER_NAMES.map((headerName) => {
      const summary = summaryByHeader.get(headerName);

      if (!summary) {
        return {
          findingTitles: [],
          name: headerName,
          status: "Not checked" as const,
        };
      }

      return summary;
    }),
  };
}

export async function scanHttpSecurityHeaders(
  input: ScanHttpSecurityHeadersInput,
  dependencies: ScanHttpSecurityHeadersDependencies = {},
): Promise<ScanHttpSecurityHeadersResult> {
  const rawTargetUrl = input.normalizedUrl ?? input.targetUrl;

  if (!rawTargetUrl) {
    throw new ScanProcessingError(
      "HTTP headers scanner requires a normalized target URL.",
    );
  }

  const normalizedTargetUrl = normalizeUrl(rawTargetUrl);
  const homepageResponse = await fetchHomepageResponse(normalizedTargetUrl, {
    fetch: dependencies.fetch ?? fetch,
    maxRedirects: dependencies.maxRedirects,
    timeoutMilliseconds: dependencies.timeoutMilliseconds,
    validateSafeTarget: dependencies.validateSafeTarget ?? assertSafeTargetUrl,
  });
  const analysis = analyzeHttpSecurityHeaders({
    finalUrl: homepageResponse.finalUrl,
    headers: homepageResponse.headers,
    scanId: input.scanId,
  });

  return {
    ...analysis,
    finalUrl: homepageResponse.finalUrl,
    redirectsFollowed: homepageResponse.redirectsFollowed,
    statusCode: homepageResponse.statusCode,
  };
}
