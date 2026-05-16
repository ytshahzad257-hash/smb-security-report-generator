import {
  assertSafeTargetUrl,
  normalizeUrl,
  UrlSafetyError,
} from "../security/urlSafety.ts";

export const TECH_DETECTION_CATEGORY = "Technology Detection";

const USER_AGENT = "SMB-Security-Report-Generator/1.0";
const MAX_HOMEPAGE_TIMEOUT_MS = 10_000;
const DEFAULT_HOMEPAGE_TIMEOUT_MS = 10_000;
const MAX_PATH_TIMEOUT_MS = 5_000;
const DEFAULT_PATH_TIMEOUT_MS = 5_000;
const HOMEPAGE_BODY_LIMIT_BYTES = 512_000;
const PATH_BODY_LIMIT_BYTES = 64_000;

const PUBLIC_PATHS = [
  "/admin",
  "/login",
  "/wp-login.php",
  "/wp-admin",
  "/phpmyadmin",
  "/server-status",
  "/.git/",
  "/.env",
  "/backup.zip",
  "/config.php",
  "/xmlrpc.php",
] as const;
const GENERIC_FALLBACK_PATH = "/__smbscanner-random-not-found-check";

const TECHNOLOGY_ORDER = [
  "WordPress",
  "WooCommerce",
  "Shopify",
  "Laravel",
  "PHP",
  "Apache",
  "Nginx",
  "Cloudflare",
  "React",
  "Next.js",
  "jQuery",
  "Bootstrap",
] as const;

type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
type ScanLogLevel = "INFO" | "WARN" | "ERROR";
type PublicPath = (typeof PUBLIC_PATHS)[number];
type TechnologyName = (typeof TECHNOLOGY_ORDER)[number];
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type HeaderRecord = Record<string, string | string[] | null | undefined>;
type HeadersLike = Pick<Headers, "get" | "forEach">;
type HeaderSource = HeadersLike | HeaderRecord;

export type TechDetectionFinding = {
  scanId: string;
  title: string;
  severity: FindingSeverity;
  category: typeof TECH_DETECTION_CATEGORY;
  owaspMapping: string;
  evidence: string;
  impact: string;
  fix: string;
  confidence: ConfidenceLevel;
};

export type ExposedPathCheckStatus =
  | "Reachable"
  | "Redirected"
  | "Forbidden"
  | "Inconclusive"
  | "Not found"
  | "Check failed";

export type ExposedPathCheck = {
  path: PublicPath;
  url: string;
  statusCode: number | null;
  status: ExposedPathCheckStatus;
  evidence: string | null;
  findingTitle: string | null;
  confidence: ConfidenceLevel | null;
  error: string | null;
};

export type TechDetectionSummary = {
  technologiesDetected: TechnologyName[];
  wordpressDetected: boolean;
  wordpressEvidence: string[];
  woocommerceDetected: boolean;
  woocommerceEvidence: string[];
  xmlRpcAccessible: boolean;
  xmlRpcEvidence: string | null;
  serverHeader: string | null;
  exposedPathChecks: ExposedPathCheck[];
  homepageFinalUrl: string | null;
  homepageStatusCode: number | null;
  checkedAt: string;
};

export type TechDetectionScannerLog = {
  level: ScanLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
};

export type ScanTechDetectionInput = {
  scanId: string;
  targetUrl: string;
  normalizedUrl: string;
  rootDomain: string;
};

export type ScanTechDetectionResult = {
  findings: TechDetectionFinding[];
  techSummary: TechDetectionSummary;
  logs: TechDetectionScannerLog[];
};

type ScanTechDetectionDependencies = {
  fetch?: FetchLike;
  homepageTimeoutMilliseconds?: number;
  now?: () => Date;
  pathTimeoutMilliseconds?: number;
  validateSafeTarget?: (url: string) => Promise<unknown>;
};

type ResponseSnapshot = {
  bodyText: string;
  bodyTruncated: boolean;
  headers: Record<string, string>;
  redirectLocation: string | null;
  statusCode: number;
  url: string;
};

type GenericFallbackReference = {
  homepageSnapshot: ResponseSnapshot | null;
  randomPathSnapshot: ResponseSnapshot | null;
};

type TechnologyAnalysis = {
  technologies: Set<TechnologyName>;
  wordpressVersionGenerator: string | null;
  wordpressEvidence: string[];
  woocommerceEvidence: string[];
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

function normalizeTimeout(
  timeoutMilliseconds: number | undefined,
  defaultTimeoutMilliseconds: number,
  maxTimeoutMilliseconds: number,
) {
  if (!timeoutMilliseconds || timeoutMilliseconds <= 0) {
    return defaultTimeoutMilliseconds;
  }

  return Math.min(timeoutMilliseconds, maxTimeoutMilliseconds);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getSafeFetchErrorMessage(error: unknown) {
  if (error instanceof UrlSafetyError) {
    return error.message;
  }

  if (isAbortError(error)) {
    return "Request timed out while checking the target.";
  }

  return "Request could not be completed safely.";
}

async function readResponseText(response: Response, maxBytes: number) {
  if (!response.body) {
    return {
      text: "",
      truncated: false,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const remainingBytes = maxBytes - bytesRead;

    if (remainingBytes <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }

    if (value.byteLength > remainingBytes) {
      chunks.push(decoder.decode(value.slice(0, remainingBytes), { stream: true }));
      truncated = true;
      await reader.cancel();
      break;
    }

    chunks.push(decoder.decode(value, { stream: true }));
    bytesRead += value.byteLength;
  }

  chunks.push(decoder.decode());

  return {
    text: chunks.join(""),
    truncated,
  };
}

async function fetchSnapshot(input: {
  bodyLimitBytes: number;
  fetcher: FetchLike;
  timeoutMilliseconds: number;
  url: string;
  validateSafeTarget: (url: string) => Promise<unknown>;
}) {
  await input.validateSafeTarget(input.url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMilliseconds);

  try {
    const response = await input.fetcher(input.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    const body = await readResponseText(response, input.bodyLimitBytes);

    return {
      bodyText: body.text,
      bodyTruncated: body.truncated,
      headers: headersToRecord(response.headers),
      redirectLocation: response.headers.get("location"),
      statusCode: response.status,
      url: input.url,
    } satisfies ResponseSnapshot;
  } finally {
    clearTimeout(timeout);
  }
}

function createFinding(
  scanId: string,
  input: Omit<TechDetectionFinding, "category" | "scanId">,
): TechDetectionFinding {
  return {
    scanId,
    category: TECH_DETECTION_CATEGORY,
    ...input,
  };
}

function addUniqueEvidence(evidence: string[], value: string) {
  if (!evidence.includes(value)) {
    evidence.push(value);
  }
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const attributePattern =
    /([^\s=/"'>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function getMetaGenerators(html: string) {
  const generators: string[] = [];

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);

    if (attributes.name?.toLowerCase() === "generator" && attributes.content) {
      generators.push(attributes.content);
    }
  }

  return generators;
}

function findWordPressVersionGenerator(generators: string[]) {
  return (
    generators.find((generator) =>
      /\bwordpress\s+\d+(?:\.\d+)+\b/i.test(generator),
    ) ?? null
  );
}

function hasWordPressHomepageSignature(body: string) {
  const lowerBody = body.toLowerCase();
  const generators = getMetaGenerators(body);

  return (
    lowerBody.includes("/wp-content/") ||
    lowerBody.includes("/wp-includes/") ||
    lowerBody.includes("wp-emoji-release") ||
    lowerBody.includes("wp-block-library") ||
    generators.some((generator) => /\bwordpress\b/i.test(generator))
  );
}

function addTechnology(
  technologies: Set<TechnologyName>,
  name: TechnologyName,
  condition: boolean,
) {
  if (condition) {
    technologies.add(name);
  }
}

export function analyzeTechnologySignals(input: {
  headers: HeaderSource;
  html: string;
}) {
  const technologies = new Set<TechnologyName>();
  const wordpressEvidence: string[] = [];
  const woocommerceEvidence: string[] = [];
  const lowerHtml = input.html.toLowerCase();
  const metaGenerators = getMetaGenerators(input.html);
  const serverHeader = getHeaderValue(input.headers, "Server") ?? "";
  const poweredByHeader = getHeaderValue(input.headers, "X-Powered-By") ?? "";
  const setCookieHeader = getHeaderValue(input.headers, "Set-Cookie") ?? "";
  const lowerServerHeader = serverHeader.toLowerCase();
  const lowerPoweredByHeader = poweredByHeader.toLowerCase();
  const lowerSetCookieHeader = setCookieHeader.toLowerCase();

  if (hasWordPressHomepageSignature(input.html) && lowerHtml.includes("/wp-content/")) {
    addUniqueEvidence(
      wordpressEvidence,
      "Homepage HTML references /wp-content/.",
    );
  }

  if (hasWordPressHomepageSignature(input.html) && lowerHtml.includes("/wp-includes/")) {
    addUniqueEvidence(
      wordpressEvidence,
      "Homepage HTML references /wp-includes/.",
    );
  }

  const wordpressGenerator = metaGenerators.find((generator) =>
    generator.toLowerCase().includes("wordpress"),
  );
  const wordpressVersionGenerator = findWordPressVersionGenerator(metaGenerators);

  if (wordpressGenerator) {
    addUniqueEvidence(
      wordpressEvidence,
      `Meta generator references ${wordpressGenerator}.`,
    );
  }

  if (lowerHtml.includes("wp-emoji-release")) {
    addUniqueEvidence(wordpressEvidence, "Homepage HTML references wp-emoji-release.");
  }

  if (lowerHtml.includes("wp-block-library")) {
    addUniqueEvidence(wordpressEvidence, "Homepage HTML references wp-block-library.");
  }

  if (lowerHtml.includes("/wp-content/plugins/woocommerce/")) {
    addUniqueEvidence(
      woocommerceEvidence,
      "Homepage HTML references /wp-content/plugins/woocommerce/.",
    );
  }

  if (lowerHtml.includes("wc-cart-fragments")) {
    addUniqueEvidence(
      woocommerceEvidence,
      "Homepage HTML references wc-cart-fragments.",
    );
  }

  if (lowerHtml.includes("woocommerce_params")) {
    addUniqueEvidence(
      woocommerceEvidence,
      "Homepage HTML references woocommerce_params.",
    );
  }

  if (
    lowerHtml.includes("woocommerce") &&
    (lowerHtml.includes(".css") || lowerHtml.includes(".js"))
  ) {
    addUniqueEvidence(
      woocommerceEvidence,
      "Homepage HTML references WooCommerce script or style markers.",
    );
  }

  addTechnology(technologies, "Shopify", lowerHtml.includes("cdn.shopify.com"));
  addTechnology(technologies, "Shopify", lowerHtml.includes("shopify.theme"));
  addTechnology(
    technologies,
    "Laravel",
    lowerPoweredByHeader.includes("laravel") ||
      lowerSetCookieHeader.includes("laravel_session") ||
      lowerHtml.includes('name="csrf-token"'),
  );
  addTechnology(
    technologies,
    "PHP",
    lowerPoweredByHeader.includes("php") || /\bphp\/\d/i.test(lowerServerHeader),
  );
  addTechnology(technologies, "Apache", lowerServerHeader.includes("apache"));
  addTechnology(technologies, "Nginx", lowerServerHeader.includes("nginx"));
  addTechnology(
    technologies,
    "Cloudflare",
    lowerServerHeader.includes("cloudflare") ||
      getHeaderValue(input.headers, "CF-Ray") !== null ||
      getHeaderValue(input.headers, "CF-Cache-Status") !== null,
  );
  addTechnology(
    technologies,
    "React",
    lowerHtml.includes("data-reactroot") ||
      lowerHtml.includes("data-react-helmet") ||
      /<script[^>]+src=["'][^"']*react[^"']*["']/i.test(input.html),
  );
  addTechnology(
    technologies,
    "Next.js",
    lowerHtml.includes("/_next/") ||
      lowerHtml.includes("__next_data__") ||
      lowerHtml.includes('id="__next"'),
  );
  addTechnology(
    technologies,
    "jQuery",
    /<script[^>]+src=["'][^"']*jquery[^"']*["']/i.test(input.html),
  );
  addTechnology(
    technologies,
    "Bootstrap",
    /<(?:script|link)[^>]+(?:src|href)=["'][^"']*bootstrap(?:\.min)?\.(?:js|css)[^"']*["']/i.test(
      input.html,
    ),
  );

  if (wordpressEvidence.length > 0) {
    technologies.add("WordPress");
  }

  if (woocommerceEvidence.length > 0) {
    technologies.add("WooCommerce");
  }

  return {
    technologies,
    wordpressVersionGenerator,
    woocommerceEvidence,
    wordpressEvidence,
  } satisfies TechnologyAnalysis;
}

function hasDetailedServerVersion(serverHeader: string | null) {
  if (!serverHeader) {
    return false;
  }

  return /\b(?:apache|nginx|php|openresty|litespeed|microsoft-iis)\/\d+(?:\.\d+)+(?:[^\s,;]*)?/i.test(
    serverHeader,
  );
}

export function analyzeServerHeaderExposure(input: {
  scanId: string;
  serverHeader: string | null;
}) {
  if (!hasDetailedServerVersion(input.serverHeader)) {
    return [];
  }

  return [
    createFinding(input.scanId, {
      confidence: "HIGH",
      evidence: input.serverHeader ?? "",
      fix: "Reduce unnecessary version disclosure in response headers.",
      impact: "Detailed version disclosure can help attackers fingerprint the stack.",
      owaspMapping: "Security Misconfiguration",
      severity: "LOW",
      title: "Server version exposed in response header",
    }),
  ];
}

function rootPathUrl(baseUrl: string, path: string) {
  const parsed = new URL(baseUrl);

  parsed.pathname = path;
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString();
}

function getPathStatus(statusCode: number): ExposedPathCheckStatus {
  if (statusCode >= 200 && statusCode < 300) {
    return "Inconclusive";
  }

  if ([301, 302, 307, 308].includes(statusCode)) {
    return "Redirected";
  }

  if (statusCode === 403) {
    return "Forbidden";
  }

  if (statusCode === 404) {
    return "Not found";
  }

  return "Check failed";
}

function isSuccessfulStatus(statusCode: number | null) {
  return statusCode !== null && statusCode >= 200 && statusCode < 300;
}

function isRedirectStatus(statusCode: number | null) {
  return statusCode !== null && statusCode >= 300 && statusCode < 400;
}

function hasWordPressLoginSignature(body: string) {
  return getWordPressLoginSignatures(body).length >= 2;
}

function hasWordPressLoginMarker(bodyText: string) {
  return hasWordPressLoginSignature(bodyText);
}

function getWordPressLoginSignatures(body: string) {
  const lowerBody = body.toLowerCase();
  const signatures: string[] = [];

  if (lowerBody.includes("wp-login.php")) signatures.push("wp-login.php");
  if (lowerBody.includes('id="loginform"') || lowerBody.includes("id='loginform'")) {
    signatures.push("loginform");
  }
  if (
    lowerBody.includes('name="user_login"') ||
    lowerBody.includes("name='user_login'") ||
    lowerBody.includes('id="user_login"') ||
    lowerBody.includes("id='user_login'")
  ) {
    signatures.push("user_login");
  }
  if (
    lowerBody.includes('id="wp-submit"') ||
    lowerBody.includes("id='wp-submit'") ||
    lowerBody.includes('name="wp-submit"') ||
    lowerBody.includes("name='wp-submit'")
  ) {
    signatures.push("wp-submit");
  }
  if (lowerBody.includes("/wp-admin/")) signatures.push("/wp-admin/");
  if (lowerBody.includes("wordpress-logo")) signatures.push("wordpress-logo");
  if (body.includes("Log In \u2039") || body.includes("Log In &lsaquo;")) {
    signatures.push("Log In <");
  }
  if (/name=["']log["']/.test(lowerBody)) {
    signatures.push("name=log");
  }
  if (/name=["']pwd["']/.test(lowerBody)) {
    signatures.push("name=pwd");
  }

  return signatures;
}

function getWordPressAdminSignatures(snapshot: ResponseSnapshot) {
  if (![200, 301, 302, 403].includes(snapshot.statusCode)) {
    return [];
  }

  const lowerBody = snapshot.bodyText.toLowerCase();
  const headersText = Object.values(snapshot.headers).join(" ").toLowerCase();
  const location = snapshot.redirectLocation?.toLowerCase() ?? "";
  const haystack = `${lowerBody} ${headersText} ${location}`;
  const signatures: string[] = [];

  if (location.includes("wp-login.php") && lowerBody.includes("wordpress")) {
    signatures.push("WordPress admin redirect");
  }
  if (haystack.includes("/wp-admin/") && haystack.includes("wordpress")) {
    signatures.push("/wp-admin/");
  }
  if (lowerBody.includes("wordpress") && lowerBody.includes("wp-")) {
    signatures.push("WordPress admin content");
  }

  return signatures;
}

function parseJsonObject(body: string) {
  try {
    const value = JSON.parse(body) as unknown;

    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

function jsonContainsWordPressRestMarker(value: unknown): string[] {
  const signatures: string[] = [];

  if (typeof value === "string") {
    if (value === "wp/v2") signatures.push("wp/v2 namespace");
    if (value.includes("/wp/v2")) signatures.push("WordPress REST route");
    if (/\bwordpress\b/i.test(value)) signatures.push("WordPress generator");
    return signatures;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      signatures.push(...jsonContainsWordPressRestMarker(item));
    }

    return signatures;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "namespaces" || key === "routes" || key === "generator") {
        signatures.push(...jsonContainsWordPressRestMarker(item));
      } else if (key.includes("/wp/v2")) {
        signatures.push("WordPress REST route");
      } else if (key.toLowerCase() === "generator") {
        signatures.push(...jsonContainsWordPressRestMarker(item));
      }
    }
  }

  return [...new Set(signatures)];
}

function hasWpJsonSignature(snapshot: ResponseSnapshot) {
  return getWpJsonSignatures(snapshot).length > 0;
}

function getWpJsonSignatures(snapshot: ResponseSnapshot) {
  const contentType = getHeaderValue(snapshot.headers, "Content-Type") ?? "";

  if (!isSuccessfulStatus(snapshot.statusCode)) {
    return [];
  }

  const parsedJson = parseJsonObject(snapshot.bodyText);

  if (!contentType.toLowerCase().includes("application/json") && !parsedJson) {
    return [];
  }

  return jsonContainsWordPressRestMarker(parsedJson);
}

function hasPhpMyAdminSignature(body: string) {
  return getPhpMyAdminSignatures(body).length > 0;
}

function hasPhpMyAdminMarker(bodyText: string) {
  return hasPhpMyAdminSignature(bodyText);
}

function getPhpMyAdminSignatures(body: string) {
  const lowerBody = body.toLowerCase();
  const signatures: string[] = [];

  if (/name=["']pma_username["']/i.test(body)) signatures.push('name="pma_username"');
  if (/id=["']pma_login["']/i.test(body)) signatures.push('id="pma_login"');
  if (lowerBody.includes("phpmyadmin login")) signatures.push("phpMyAdmin login");
  if (lowerBody.includes("/themes/pmahomme/")) signatures.push("/themes/pmahomme/");
  if (lowerBody.includes("phpmyadmin.css")) signatures.push("phpmyadmin.css");
  if (/<title>\s*phpmyadmin\b/i.test(body)) signatures.push("<title>phpMyAdmin");

  return signatures;
}

function hasServerStatusMarker(bodyText: string) {
  return getServerStatusSignatures(bodyText).length > 0;
}

function getServerStatusSignatures(bodyText: string) {
  const lowerBody = bodyText.toLowerCase();
  const signatures: string[] = [];

  if (lowerBody.includes("apache server status")) {
    signatures.push("apache server status");
  }
  if (lowerBody.includes("server version: apache")) {
    signatures.push("server version: apache");
  }
  if (lowerBody.includes("server uptime")) signatures.push("server uptime");

  return signatures;
}

function hasGitExposureSignature(body: string) {
  return getGitDirectorySignatures(body).length > 0;
}

function hasGitDirectoryMarker(bodyText: string) {
  return hasGitExposureSignature(bodyText);
}

function getGitDirectorySignatures(body: string) {
  const lowerBody = body.toLowerCase();
  const signatures: string[] = [];

  if (lowerBody.includes("index of /.git")) signatures.push("Index of /.git");
  if (lowerBody.includes("refs/")) signatures.push("refs/");
  if (lowerBody.includes("objects/")) signatures.push("objects/");
  if (lowerBody.includes("repositoryformatversion")) {
    signatures.push("repositoryformatversion");
  }
  if (lowerBody.includes("[core]")) signatures.push("[core]");
  if (/\bhead\b/.test(lowerBody)) signatures.push("HEAD");

  return signatures;
}

function hasEnvExposureSignature(body: string) {
  return getEnvSignatures(body).length > 0;
}

function hasEnvMarker(bodyText: string) {
  return hasEnvExposureSignature(bodyText);
}

function getEnvSignatures(body: string) {
  if (/<(?:html|body|script|style|main|div)\b/i.test(body)) {
    return [];
  }

  const sensitiveEnvPattern =
    /(?:^|\n)\s*(?:app_key|database_url|db_password|db_host|secret(?:_key)?|api_key|token)\s*=\s*\S+/i;
  const envLinePattern =
    /(?:^|\n)\s*[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s<>"']+/g;
  const envLineMatches = body.match(envLinePattern) ?? [];
  const signatures: string[] = [];

  if (sensitiveEnvPattern.test(body)) signatures.push("secret-like env key");
  if (envLineMatches.length >= 2) signatures.push("multiple KEY=value lines");

  return signatures;
}

function hasBackupZipSignature(headers: HeaderSource, firstBytes: string) {
  const contentType = getHeaderValue(headers, "Content-Type") ?? "";
  const contentDisposition = getHeaderValue(headers, "Content-Disposition") ?? "";

  return (
    /\bapplication\/zip\b/i.test(contentType) ||
    (/\bapplication\/octet-stream\b/i.test(contentType) &&
      /(?:backup|\.zip)/i.test(contentDisposition)) ||
    firstBytes.startsWith("PK")
  );
}

function getZipSignatures(snapshot: ResponseSnapshot) {
  const contentType = getHeaderValue(snapshot.headers, "Content-Type") ?? "";
  const contentDisposition = getHeaderValue(snapshot.headers, "Content-Disposition") ?? "";
  const signatures: string[] = [];

  if (/\bapplication\/zip\b/i.test(contentType)) {
    signatures.push("application/zip");
  }
  if (
    /\bapplication\/octet-stream\b/i.test(contentType) &&
    /(?:backup|\.zip)/i.test(contentDisposition)
  ) {
    signatures.push("octet-stream zip context");
  }
  if (snapshot.bodyText.startsWith("PK")) signatures.push("ZIP magic");

  return signatures;
}

function hasZipMarker(snapshot: ResponseSnapshot) {
  return hasBackupZipSignature(snapshot.headers, snapshot.bodyText.slice(0, 8));
}

function hasConfigLeakSignature(body: string) {
  return getConfigExposureSignatures(body).signatures.length > 0;
}

function getConfigExposureLevel(bodyText: string) {
  return getConfigExposureSignatures(bodyText).level;
}

function getConfigExposureSignatures(body: string) {
  if (/<(?:html|body|script|style|main|div)\b/i.test(body) && !body.includes("<?php")) {
    return {
      level: null,
      signatures: [],
    };
  }

  const lowerBody = body.toLowerCase();
  const containsPhpSource = lowerBody.includes("<?php");
  const containsSecret =
    /(?:db_password|database_password|password|secret|api_key|private_key)/i.test(
      body,
    );
  const containsConfigMarker =
    lowerBody.includes("database config") ||
    lowerBody.includes("config array") ||
    lowerBody.includes("define('db_") ||
    lowerBody.includes('define("db_') ||
    lowerBody.includes("$db") ||
    lowerBody.includes("mysqli") ||
    lowerBody.includes("pdo");

  const signatures: string[] = [];

  if (containsPhpSource) signatures.push("PHP source");
  if (containsSecret) signatures.push("secret/config key");
  if (containsConfigMarker) signatures.push("configuration source marker");

  if (containsPhpSource && containsSecret) {
    return {
      level: "HIGH" as const,
      signatures,
    };
  }

  if (containsPhpSource && containsConfigMarker) {
    return {
      level: "MEDIUM" as const,
      signatures,
    };
  }

  if (containsSecret && containsConfigMarker) {
    return {
      level: "MEDIUM" as const,
      signatures,
    };
  }

  return {
    level: null,
    signatures: [],
  };
}

function createPathCheckFromSnapshot(
  path: PublicPath,
  snapshot: ResponseSnapshot,
  isGenericFallback: boolean,
): ExposedPathCheck {
  const status = getPathStatus(snapshot.statusCode);
  const evidence =
    status === "Not found"
      ? `${path} responded with HTTP 404.`
      : status === "Forbidden"
        ? `${path} responded with HTTP 403.`
        : status === "Redirected"
          ? `${path} redirected with HTTP ${snapshot.statusCode}.`
          : isGenericFallback || status === "Inconclusive"
            ? "Path returned HTTP 200, but no product-specific exposure indicators were found."
            : `${path} responded with HTTP ${snapshot.statusCode}.`;

  return {
    confidence: null,
    error: null,
    evidence,
    findingTitle: null,
    path,
    status,
    statusCode: snapshot.statusCode,
    url: snapshot.url,
  };
}

function normalizeBodyForFallbackComparison(bodyText: string) {
  return bodyText
    .toLowerCase()
    .replace(/\/(?:__smbscanner-random-not-found-check|wp-login\.php|phpmyadmin|admin|login|wp-admin|server-status|backup\.zip|config\.php|xmlrpc\.php|\.env|\.git\/?)/g, "/__path__")
    .replace(/[a-f0-9]{16,}/g, "__hex__")
    .replace(/\d{4,}/g, "__num__")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

function getHtmlTitle(bodyText: string) {
  return bodyText.match(/<title[^>]*>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim() ?? "";
}

function calculateTokenSimilarity(first: string, second: string) {
  const firstTokens = new Set(first.split(/\W+/).filter((token) => token.length > 2));
  const secondTokens = new Set(second.split(/\W+/).filter((token) => token.length > 2));

  if (firstTokens.size === 0 || secondTokens.size === 0) {
    return first === second ? 1 : 0;
  }

  let intersection = 0;

  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(firstTokens.size, secondTokens.size);
}

function hasSimilarGenericFallback(input: {
  fallbackReference: GenericFallbackReference;
  snapshot: ResponseSnapshot;
}) {
  return (
    hasSimilarReferenceSnapshot(input.snapshot, input.fallbackReference.randomPathSnapshot) ||
    hasSimilarReferenceSnapshot(input.snapshot, input.fallbackReference.homepageSnapshot)
  );
}

function hasSimilarReferenceSnapshot(
  snapshot: ResponseSnapshot,
  reference: ResponseSnapshot | null,
) {
  if (
    !reference ||
    !isSuccessfulStatus(snapshot.statusCode) ||
    !isSuccessfulStatus(reference.statusCode)
  ) {
    return false;
  }

  const snapshotType = getHeaderValue(snapshot.headers, "Content-Type") ?? "";
  const fallbackType =
    getHeaderValue(reference.headers, "Content-Type") ?? "";

  if (
    snapshotType &&
    fallbackType &&
    snapshotType.toLowerCase().includes("html") !==
      fallbackType.toLowerCase().includes("html") &&
    snapshotType.split(";")[0].toLowerCase() !==
      fallbackType.split(";")[0].toLowerCase()
  ) {
    return false;
  }

  if (
    snapshotType &&
    fallbackType &&
    !snapshotType.toLowerCase().includes("html") &&
    snapshotType.split(";")[0].toLowerCase() !==
      fallbackType.split(";")[0].toLowerCase()
  ) {
    return false;
  }

  const normalizedSnapshot = normalizeBodyForFallbackComparison(
    snapshot.bodyText,
  );
  const normalizedFallback = normalizeBodyForFallbackComparison(
    reference.bodyText,
  );

  if (!normalizedSnapshot || !normalizedFallback) {
    return false;
  }

  const snapshotTitle = getHtmlTitle(snapshot.bodyText);
  const fallbackTitle = getHtmlTitle(reference.bodyText);
  const lengthDelta = Math.abs(snapshot.bodyText.length - reference.bodyText.length);
  const maxLength = Math.max(snapshot.bodyText.length, reference.bodyText.length, 1);

  return (
    normalizedSnapshot === normalizedFallback ||
    (snapshotTitle !== "" &&
      snapshotTitle === fallbackTitle &&
      lengthDelta / maxLength <= 0.15) ||
    calculateTokenSimilarity(normalizedSnapshot, normalizedFallback) >= 0.9
  );
}

function getMatchedPathSignatures(
  path: PublicPath,
  snapshot: ResponseSnapshot,
) {
  if (snapshot.statusCode === 404) {
    return [];
  }

  switch (path) {
    case "/wp-login.php":
      return getWordPressLoginSignatures(snapshot.bodyText);
    case "/phpmyadmin":
      return getPhpMyAdminSignatures(snapshot.bodyText);
    case "/server-status":
      return getServerStatusSignatures(snapshot.bodyText);
    case "/.git/":
      return getGitDirectorySignatures(snapshot.bodyText);
    case "/.env":
      return getEnvSignatures(snapshot.bodyText);
    case "/backup.zip":
      return getZipSignatures(snapshot);
    case "/config.php":
      return getConfigExposureSignatures(snapshot.bodyText).signatures;
    case "/wp-admin":
      return getWordPressAdminSignatures(snapshot);
    case "/xmlrpc.php":
      return getXmlRpcSignatures(snapshot);
    default:
      return [];
  }
}

function getSafeSnapshotMetadata(snapshot: ResponseSnapshot) {
  return {
    bodyLength: snapshot.bodyText.length,
    contentType: getHeaderValue(snapshot.headers, "Content-Type"),
  };
}

function createErroredPathCheck(
  path: PublicPath,
  url: string,
  error: unknown,
): ExposedPathCheck {
  return {
    confidence: null,
    error: getSafeFetchErrorMessage(error),
    evidence: null,
    findingTitle: null,
    path,
    status: "Check failed",
    statusCode: null,
    url,
  };
}

function createPathFinding(input: {
  confidence: ConfidenceLevel;
  evidence: string;
  fix: string;
  impact: string;
  scanId: string;
  severity: FindingSeverity;
  title: string;
}) {
  return createFinding(input.scanId, {
    confidence: input.confidence,
    evidence: input.evidence,
    fix: input.fix,
    impact: input.impact,
    owaspMapping: "Security Misconfiguration",
    severity: input.severity,
    title: input.title,
  });
}

function analyzePathFinding(input: {
  check: ExposedPathCheck;
  isGenericFallback: boolean;
  scanId: string;
  snapshot: ResponseSnapshot;
}) {
  const { check, scanId, snapshot } = input;
  const bodyText = snapshot.bodyText;
  const path = check.path;

  if (input.isGenericFallback) {
    return null;
  }

  if (
    path === "/wp-login.php" &&
    isSuccessfulStatus(snapshot.statusCode) &&
    hasWordPressLoginMarker(bodyText)
  ) {
    return createPathFinding({
      confidence: "MEDIUM",
      evidence:
        "/wp-login.php responded with WordPress login page indicators during a safe request.",
      fix: "Keep WordPress authentication protected with strong credentials, MFA where available, and rate limiting.",
      impact:
        "A public WordPress login page can increase password-attack exposure, although it is not a vulnerability by itself.",
      scanId,
      severity: "LOW",
      title: "WordPress login page appears publicly reachable.",
    });
  }

  if (
    path === "/phpmyadmin" &&
    isSuccessfulStatus(snapshot.statusCode) &&
    hasPhpMyAdminMarker(bodyText)
  ) {
    return createPathFinding({
      confidence: "HIGH",
      evidence:
        "phpMyAdmin indicators were observed at /phpmyadmin with an HTTP 200 response.",
      fix: "Restrict phpMyAdmin access to trusted networks or remove it from the public site if it is not required.",
      impact:
        "Public database administration interfaces increase attack surface if exposed to the internet.",
      scanId,
      severity: "MEDIUM",
      title: "phpMyAdmin indicators were observed at /phpmyadmin.",
    });
  }

  if (
    path === "/server-status" &&
    isSuccessfulStatus(snapshot.statusCode) &&
    hasServerStatusMarker(bodyText)
  ) {
    return createPathFinding({
      confidence: "HIGH",
      evidence:
        "Apache server-status indicators were observed at /server-status with an HTTP 200 response.",
      fix: "Disable public server-status access or restrict it to trusted administrative networks.",
      impact:
        "Public server-status pages can expose operational details about the web server.",
      scanId,
      severity: "MEDIUM",
      title: "server-status endpoint appears reachable",
    });
  }

  if (
    path === "/.git/" &&
    isSuccessfulStatus(snapshot.statusCode) &&
    hasGitDirectoryMarker(bodyText)
  ) {
    return createPathFinding({
      confidence: "HIGH",
      evidence:
        "Git repository indicators were observed at /.git/ with an HTTP 200 response.",
      fix: "Remove the .git directory from the web root and block access to version-control metadata.",
      impact:
        "Exposed Git metadata can leak source code, configuration history, and sensitive implementation details.",
      scanId,
      severity: "HIGH",
      title: ".git directory appears accessible",
    });
  }

  if (path === "/.env" && isSuccessfulStatus(snapshot.statusCode) && hasEnvMarker(bodyText)) {
    return createPathFinding({
      confidence: "HIGH",
      evidence:
        ".env-style key/value configuration indicators were observed at /.env with an HTTP 200 response.",
      fix: "Remove .env files from the web root and block direct access to environment configuration files.",
      impact:
        "Public environment files can expose secrets, database credentials, and application configuration.",
      scanId,
      severity: "HIGH",
      title: ".env file appears accessible",
    });
  }

  if (path === "/backup.zip" && isSuccessfulStatus(snapshot.statusCode)) {
    if (hasZipMarker(snapshot)) {
      return createPathFinding({
        confidence: "HIGH",
        evidence:
          "Archive indicators were observed at /backup.zip with an HTTP 200 response.",
        fix: "Remove backup archives from the public web root and store backups outside publicly served paths.",
        impact:
          "Public backup archives can expose source code, configuration files, or business data.",
        scanId,
        severity: "HIGH",
        title: "Backup archive appears publicly reachable",
      });
    }
  }

  if (path === "/config.php" && isSuccessfulStatus(snapshot.statusCode)) {
    const exposureLevel = hasConfigLeakSignature(bodyText)
      ? getConfigExposureLevel(bodyText)
      : null;

    if (exposureLevel) {
      return createPathFinding({
        confidence: exposureLevel === "HIGH" ? "HIGH" : "MEDIUM",
        evidence:
          "Configuration source indicators were observed at /config.php with an HTTP 200 response.",
        fix: "Keep configuration files outside the public web root and ensure PHP source is not served as static text.",
        impact:
          "Exposed configuration files can reveal sensitive application settings or credentials.",
        scanId,
        severity: exposureLevel,
        title: "config.php appears to expose configuration content",
      });
    }
  }

  return null;
}

function addFindingToPathCheck(
  check: ExposedPathCheck,
  finding: TechDetectionFinding | null,
) {
  if (!finding) {
    return check;
  }

  return {
    ...check,
    confidence: finding.confidence,
    findingTitle: finding.title,
    status: "Reachable" as const,
  };
}

function responseHasXmlContent(snapshot: ResponseSnapshot) {
  const contentType = getHeaderValue(snapshot.headers, "Content-Type") ?? "";

  return (
    contentType.toLowerCase().includes("xml") ||
    snapshot.bodyText.trimStart().startsWith("<?xml")
  );
}

function getXmlRpcSignatures(snapshot: ResponseSnapshot) {
  if (![200, 405].includes(snapshot.statusCode)) {
    return [];
  }

  const lowerBody = snapshot.bodyText.toLowerCase();
  const signatures: string[] = [];

  if (lowerBody.includes("xml-rpc server accepts post requests only")) {
    signatures.push("XML-RPC server accepts POST requests only");
  }
  if (lowerBody.includes("<methodresponse")) signatures.push("<methodResponse>");
  if (lowerBody.includes("<fault>")) signatures.push("<fault>");
  if (lowerBody.includes("faultcode")) signatures.push("faultCode");
  if (lowerBody.includes("xmlrpc")) signatures.push("xmlrpc");
  if (lowerBody.includes("xml-rpc")) signatures.push("XML-RPC");

  if (
    snapshot.statusCode === 200 &&
    !responseHasXmlContent(snapshot) &&
    !lowerBody.includes("xml-rpc server accepts post requests only")
  ) {
    return signatures.filter((signature) =>
      ["<methodResponse>", "<fault>", "faultCode", "xmlrpc"].includes(signature),
    );
  }

  return signatures;
}

function hasXmlRpcSignature(
  body: string,
  status: number,
  headers: HeaderSource,
) {
  return (
    getXmlRpcSignatures({
      bodyText: body,
      bodyTruncated: false,
      headers: Object.fromEntries(
        Object.entries(headers as HeaderRecord).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : String(value ?? ""),
        ]),
      ),
      redirectLocation: null,
      statusCode: status,
      url: "",
    }).length > 0
  );
}

function analyzeXmlRpc(input: {
  isGenericFallback: boolean;
  scanId: string;
  snapshot: ResponseSnapshot | null;
}) {
  if (!input.snapshot) {
    return {
      finding: null,
      xmlRpcAccessible: false,
      xmlRpcEvidence: null,
    };
  }

  const matchedSignatures = hasXmlRpcSignature(
    input.snapshot.bodyText,
    input.snapshot.statusCode,
    input.snapshot.headers,
  )
    ? getXmlRpcSignatures(input.snapshot)
    : [];
  const accessible = matchedSignatures.length > 0 && !input.isGenericFallback;

  if (!accessible) {
    return {
      finding: null,
      xmlRpcAccessible: false,
      xmlRpcEvidence: null,
    };
  }

  return {
    finding: createFinding(input.scanId, {
      confidence: "MEDIUM",
      evidence: `The /xmlrpc.php endpoint responded with HTTP ${input.snapshot.statusCode} to a safe request.`,
      fix: "Disable XML-RPC if not needed, or restrict access according to the site's requirements.",
      impact: "Public XML-RPC endpoints can increase attack surface if not required.",
      owaspMapping: "Security Misconfiguration",
      severity: "MEDIUM",
      title: "XML-RPC endpoint appears reachable",
    }),
    xmlRpcAccessible: true,
    xmlRpcEvidence: `The /xmlrpc.php endpoint responded with HTTP ${input.snapshot.statusCode} to a safe request.`,
  };
}

function getOrderedTechnologies(technologies: Set<TechnologyName>) {
  return TECHNOLOGY_ORDER.filter((technology) => technologies.has(technology));
}

function buildWordPressFinding(input: {
  scanId: string;
  wordpressEvidence: string[];
}) {
  if (input.wordpressEvidence.length === 0) {
    return null;
  }

  return createFinding(input.scanId, {
    confidence: input.wordpressEvidence.length > 1 ? "HIGH" : "MEDIUM",
    evidence: input.wordpressEvidence.join(" "),
    fix: "Keep WordPress core, themes, and plugins updated, and remove unnecessary public version disclosure where practical.",
    impact:
      "Visible CMS indicators can help fingerprint the stack, though this observation is not a vulnerability by itself.",
    owaspMapping: "Security Misconfiguration",
    severity: "INFO",
    title: "WordPress indicators detected.",
  });
}

function buildWordPressVersionDisclosureFinding(input: {
  scanId: string;
  generatorValue: string;
}) {
  return createFinding(input.scanId, {
    confidence: "HIGH",
    evidence: `Meta generator value: ${input.generatorValue}`,
    fix: "Remove public generator/version disclosure where practical and keep WordPress updated.",
    impact: "Visible CMS version details can help fingerprint the stack.",
    owaspMapping: "Security Misconfiguration",
    severity: "LOW",
    title: "WordPress version exposed in meta generator",
  });
}

function buildWooCommerceFinding(input: {
  scanId: string;
  woocommerceEvidence: string[];
}) {
  if (input.woocommerceEvidence.length === 0) {
    return null;
  }

  return createFinding(input.scanId, {
    confidence: input.woocommerceEvidence.length > 1 ? "HIGH" : "MEDIUM",
    evidence: input.woocommerceEvidence.join(" "),
    fix: "Keep WooCommerce and related extensions updated, and remove unused plugins or public plugin assets where practical.",
    impact:
      "Visible ecommerce plugin indicators can help fingerprint the stack, though this observation is not a vulnerability by itself.",
    owaspMapping: "Security Misconfiguration",
    severity: "INFO",
    title: "WooCommerce indicators detected.",
  });
}

async function fetchOptionalSnapshot(input: {
  bodyLimitBytes: number;
  fetcher: FetchLike;
  logs: TechDetectionScannerLog[];
  logMetadata: Record<string, unknown>;
  logMessage: string;
  timeoutMilliseconds: number;
  url: string;
  validateSafeTarget: (url: string) => Promise<unknown>;
}) {
  try {
    return await fetchSnapshot(input);
  } catch (error) {
    input.logs.push({
      level: "WARN",
      message: input.logMessage,
      metadata: {
        ...input.logMetadata,
        error: getSafeFetchErrorMessage(error),
      },
    });

    return null;
  }
}

function addWordPressEvidenceFromPath(input: {
  pathChecks: ExposedPathCheck[];
  snapshotsByPath: Map<PublicPath, ResponseSnapshot>;
  wordpressEvidence: string[];
}) {
  const wpLoginSnapshot = input.snapshotsByPath.get("/wp-login.php");
  const wpLoginCheck = input.pathChecks.find(
    (check) => check.path === "/wp-login.php",
  );

  if (
    wpLoginSnapshot &&
    wpLoginCheck?.status === "Reachable" &&
    (isSuccessfulStatus(wpLoginSnapshot.statusCode) ||
      isRedirectStatus(wpLoginSnapshot.statusCode)) &&
    hasWordPressLoginMarker(wpLoginSnapshot.bodyText)
  ) {
    addUniqueEvidence(
      input.wordpressEvidence,
      "The /wp-login.php path returned WordPress login indicators.",
    );
  }

  const wpAdminSnapshot = input.snapshotsByPath.get("/wp-admin");
  const wpAdminCheck = input.pathChecks.find((check) => check.path === "/wp-admin");

  if (
    wpAdminSnapshot &&
    wpAdminCheck?.status !== "Inconclusive" &&
    wpAdminCheck?.status !== "Not found"
  ) {
    const adminSignatures = getWordPressAdminSignatures(wpAdminSnapshot);

    if (adminSignatures.length > 0) {
      addUniqueEvidence(
        input.wordpressEvidence,
        "The /wp-admin path returned WordPress-specific indicators.",
      );
    }
  }

  if (wpLoginCheck?.findingTitle) {
    addUniqueEvidence(
      input.wordpressEvidence,
      "A related WordPress login page observation was created.",
    );
  }
}

export async function scanTechDetection(
  input: ScanTechDetectionInput,
  dependencies: ScanTechDetectionDependencies = {},
): Promise<ScanTechDetectionResult> {
  const now = dependencies.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const fetcher = dependencies.fetch ?? fetch;
  const validateSafeTarget = dependencies.validateSafeTarget ?? assertSafeTargetUrl;
  const homepageTimeoutMilliseconds = normalizeTimeout(
    dependencies.homepageTimeoutMilliseconds,
    DEFAULT_HOMEPAGE_TIMEOUT_MS,
    MAX_HOMEPAGE_TIMEOUT_MS,
  );
  const pathTimeoutMilliseconds = normalizeTimeout(
    dependencies.pathTimeoutMilliseconds,
    DEFAULT_PATH_TIMEOUT_MS,
    MAX_PATH_TIMEOUT_MS,
  );
  const normalizedTargetUrl = normalizeUrl(input.normalizedUrl || input.targetUrl);
  const findings: TechDetectionFinding[] = [];
  const logs: TechDetectionScannerLog[] = [];
  const technologies = new Set<TechnologyName>();
  const wordpressEvidence: string[] = [];
  const woocommerceEvidence: string[] = [];
  const exposedPathChecks: ExposedPathCheck[] = [];
  const snapshotsByPath = new Map<PublicPath, ResponseSnapshot>();
  let homepageSnapshot: ResponseSnapshot | null = null;
  let serverHeader: string | null = null;

  homepageSnapshot = await fetchOptionalSnapshot({
    bodyLimitBytes: HOMEPAGE_BODY_LIMIT_BYTES,
    fetcher,
    logMessage: "Tech detection homepage fetch failed",
    logMetadata: {
      url: normalizedTargetUrl,
    },
    logs,
    timeoutMilliseconds: homepageTimeoutMilliseconds,
    url: normalizedTargetUrl,
    validateSafeTarget,
  });

  if (homepageSnapshot) {
    const analysis = analyzeTechnologySignals({
      headers: homepageSnapshot.headers,
      html: homepageSnapshot.bodyText,
    });

    for (const technology of analysis.technologies) {
      technologies.add(technology);
    }

    for (const evidence of analysis.wordpressEvidence) {
      addUniqueEvidence(wordpressEvidence, evidence);
    }

    for (const evidence of analysis.woocommerceEvidence) {
      addUniqueEvidence(woocommerceEvidence, evidence);
    }

    if (analysis.wordpressVersionGenerator) {
      findings.push(
        buildWordPressVersionDisclosureFinding({
          generatorValue: analysis.wordpressVersionGenerator,
          scanId: input.scanId,
        }),
      );
    }

    serverHeader = getHeaderValue(homepageSnapshot.headers, "Server");
    findings.push(
      ...analyzeServerHeaderExposure({
        scanId: input.scanId,
        serverHeader,
      }),
    );
  }

  const genericFallbackUrl = rootPathUrl(normalizedTargetUrl, GENERIC_FALLBACK_PATH);
  const genericFallbackSnapshot = await fetchOptionalSnapshot({
    bodyLimitBytes: PATH_BODY_LIMIT_BYTES,
    fetcher,
    logMessage: "Tech detection generic fallback check failed",
    logMetadata: {
      path: GENERIC_FALLBACK_PATH,
      url: genericFallbackUrl,
    },
    logs,
    timeoutMilliseconds: pathTimeoutMilliseconds,
    url: genericFallbackUrl,
    validateSafeTarget,
  });
  const genericFallbackReference = {
    homepageSnapshot,
    randomPathSnapshot: genericFallbackSnapshot,
  };

  const wpJsonUrl = rootPathUrl(normalizedTargetUrl, "/wp-json/");
  const wpJsonSnapshot = await fetchOptionalSnapshot({
    bodyLimitBytes: PATH_BODY_LIMIT_BYTES,
    fetcher,
    logMessage: "Tech detection wp-json check failed",
    logMetadata: {
      path: "/wp-json/",
      url: wpJsonUrl,
    },
    logs,
    timeoutMilliseconds: pathTimeoutMilliseconds,
    url: wpJsonUrl,
    validateSafeTarget,
  });

  if (wpJsonSnapshot) {
    const isGenericFallback = hasSimilarGenericFallback({
      fallbackReference: genericFallbackReference,
      snapshot: wpJsonSnapshot,
    });
    const matchedSignatures =
      isGenericFallback || !hasWpJsonSignature(wpJsonSnapshot)
        ? []
        : getWpJsonSignatures(wpJsonSnapshot);

    logs.push({
      level: "INFO",
      message: "Tech detection wp-json check completed",
      metadata: {
        ...getSafeSnapshotMetadata(wpJsonSnapshot),
        isGenericFallback,
        matchedSignatures,
        path: "/wp-json/",
        status: getPathStatus(wpJsonSnapshot.statusCode),
        statusCode: wpJsonSnapshot.statusCode,
      },
    });

    if (matchedSignatures.length > 0) {
      addUniqueEvidence(
        wordpressEvidence,
        "The /wp-json/ endpoint responded with WordPress REST API indicators.",
      );
    }
  }

  for (const path of PUBLIC_PATHS) {
    const url = rootPathUrl(normalizedTargetUrl, path);

    try {
      const snapshot = await fetchSnapshot({
        bodyLimitBytes: PATH_BODY_LIMIT_BYTES,
        fetcher,
        timeoutMilliseconds: pathTimeoutMilliseconds,
        url,
        validateSafeTarget,
      });
      const isGenericFallback = hasSimilarGenericFallback({
        fallbackReference: genericFallbackReference,
        snapshot,
      });
      const matchedSignatures = isGenericFallback
        ? []
        : getMatchedPathSignatures(path, snapshot);
      const baseCheck = createPathCheckFromSnapshot(
        path,
        snapshot,
        isGenericFallback,
      );
      const finding = analyzePathFinding({
        check: baseCheck,
        isGenericFallback,
        scanId: input.scanId,
        snapshot,
      });
      let check = addFindingToPathCheck(baseCheck, finding);

      if (
        !finding &&
        path === "/wp-admin" &&
        matchedSignatures.length > 0 &&
        !isGenericFallback
      ) {
        check = {
          ...check,
          status: "Reachable",
        };
      }

      snapshotsByPath.set(path, snapshot);
      exposedPathChecks.push(check);
      logs.push({
        level: "INFO",
        message: "Tech detection exposed path check completed",
        metadata: {
          ...getSafeSnapshotMetadata(snapshot),
          isGenericFallback,
          matchedSignatures,
          path,
          status: check.status,
          statusCode: snapshot.statusCode,
        },
      });

      if (finding) {
        findings.push(finding);
      }
    } catch (error) {
      logs.push({
        level: "WARN",
        message: "Tech detection exposed path check failed",
        metadata: {
          error: getSafeFetchErrorMessage(error),
          path,
          url,
        },
      });
      exposedPathChecks.push(createErroredPathCheck(path, url, error));
    }
  }

  addWordPressEvidenceFromPath({
    pathChecks: exposedPathChecks,
    snapshotsByPath,
    wordpressEvidence,
  });

  if (wordpressEvidence.length > 0) {
    technologies.add("WordPress");
  }

  if (woocommerceEvidence.length > 0) {
    technologies.add("WooCommerce");
  }

  const xmlRpcUrl = rootPathUrl(normalizedTargetUrl, "/xmlrpc.php");
  const xmlRpcSnapshot = await fetchOptionalSnapshot({
    bodyLimitBytes: PATH_BODY_LIMIT_BYTES,
    fetcher,
    logMessage: "Tech detection XML-RPC check failed",
    logMetadata: {
      path: "/xmlrpc.php",
      url: xmlRpcUrl,
    },
    logs,
    timeoutMilliseconds: pathTimeoutMilliseconds,
    url: xmlRpcUrl,
    validateSafeTarget,
  });
  const xmlRpcIsGenericFallback = xmlRpcSnapshot
    ? hasSimilarGenericFallback({
        fallbackReference: genericFallbackReference,
        snapshot: xmlRpcSnapshot,
      })
    : false;
  const xmlRpcMatchedSignatures =
    xmlRpcSnapshot && !xmlRpcIsGenericFallback
      ? getXmlRpcSignatures(xmlRpcSnapshot)
      : [];
  const xmlRpcAnalysis = analyzeXmlRpc({
    isGenericFallback: xmlRpcIsGenericFallback,
    scanId: input.scanId,
    snapshot: xmlRpcSnapshot,
  });
  if (xmlRpcSnapshot) {
    logs.push({
      level: "INFO",
      message: "Tech detection XML-RPC check completed",
      metadata: {
        ...getSafeSnapshotMetadata(xmlRpcSnapshot),
        isGenericFallback: xmlRpcIsGenericFallback,
        matchedSignatures: xmlRpcMatchedSignatures,
        path: "/xmlrpc.php",
        status:
          xmlRpcAnalysis.xmlRpcAccessible && xmlRpcAnalysis.finding
            ? "Reachable"
            : getPathStatus(xmlRpcSnapshot.statusCode),
        statusCode: xmlRpcSnapshot.statusCode,
      },
    });
  }

  if (xmlRpcAnalysis.finding) {
    findings.push(xmlRpcAnalysis.finding);

    const xmlRpcPathCheck = exposedPathChecks.find(
      (check) => check.path === "/xmlrpc.php",
    );

    if (xmlRpcPathCheck) {
      xmlRpcPathCheck.confidence = xmlRpcAnalysis.finding.confidence;
      xmlRpcPathCheck.findingTitle = xmlRpcAnalysis.finding.title;
      xmlRpcPathCheck.status = "Reachable";
    }
  }

  const wordpressFinding = buildWordPressFinding({
    scanId: input.scanId,
    wordpressEvidence,
  });
  const woocommerceFinding = buildWooCommerceFinding({
    scanId: input.scanId,
    woocommerceEvidence,
  });

  if (wordpressFinding) {
    findings.push(wordpressFinding);
  }

  if (woocommerceFinding) {
    findings.push(woocommerceFinding);
  }

  return {
    findings,
    logs,
    techSummary: {
      checkedAt,
      exposedPathChecks,
      homepageFinalUrl: homepageSnapshot?.url ?? null,
      homepageStatusCode: homepageSnapshot?.statusCode ?? null,
      serverHeader,
      technologiesDetected: getOrderedTechnologies(technologies),
      woocommerceDetected: woocommerceEvidence.length > 0,
      woocommerceEvidence,
      wordpressDetected: wordpressEvidence.length > 0,
      wordpressEvidence,
      xmlRpcAccessible: xmlRpcAnalysis.xmlRpcAccessible,
      xmlRpcEvidence: xmlRpcAnalysis.xmlRpcEvidence,
    },
  };
}
