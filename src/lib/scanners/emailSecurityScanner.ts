import { Resolver, resolveMx, resolveTxt } from "node:dns/promises";

export const EMAIL_SECURITY_CATEGORY = "Email Security";

export const EMAIL_DKIM_SELECTORS = [
  "default",
  "google",
  "selector1",
  "selector2",
  "k1",
  "mail",
  "smtp",
] as const;

type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
type ScanLogLevel = "INFO" | "WARN" | "ERROR";

export type EmailSecurityFinding = {
  scanId: string;
  title: string;
  severity: FindingSeverity;
  category: typeof EMAIL_SECURITY_CATEGORY;
  owaspMapping: string;
  evidence: string;
  impact: string;
  fix: string;
  confidence: ConfidenceLevel;
};

export type EmailSecurityMxRecord = {
  exchange: string;
  priority: number;
};

export type EmailSecuritySummary = {
  domain: string;
  mxFound: boolean;
  mxRecords: EmailSecurityMxRecord[];
  mxError: string | null;
  spfFound: boolean;
  spfRecord: string | null;
  spfAssessment: string;
  spfError: string | null;
  dmarcFound: boolean;
  dmarcRecord: string | null;
  dmarcPolicy: string | null;
  dmarcError: string | null;
  dkimSelectorsTested: string[];
  dkimSelectorsFound: string[];
  dkimErrorCount: number;
  checkedAt: string;
};

export type EmailSecurityScannerLog = {
  level: ScanLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
};

export type ScanEmailSecurityInput = {
  scanId: string;
  targetUrl: string;
  normalizedUrl: string;
  rootDomain: string;
};

export type ScanEmailSecurityResult = {
  findings: EmailSecurityFinding[];
  emailSecuritySummary: EmailSecuritySummary;
  logs: EmailSecurityScannerLog[];
};

type DnsResolver = {
  resolveMx: (domain: string) => Promise<EmailSecurityMxRecord[]>;
  resolveTxt: (domain: string) => Promise<string[][]>;
};

type ScanEmailSecurityDependencies = {
  now?: () => Date;
  resolver?: DnsResolver;
};

export type DnsErrorClassification = "RECORD_NOT_FOUND" | "DNS_LOOKUP_FAILED";

type DnsLookupResult<T> =
  | {
      classification: null;
      records: T;
      error: null;
    }
  | {
      classification: DnsErrorClassification;
      records: T;
      error: unknown;
    };

const OWASP_EMAIL_MAPPING =
  "Identification and Authentication Failures / Security Misconfiguration";

const fallbackResolver = new Resolver();
fallbackResolver.setServers(["1.1.1.1", "8.8.8.8"]);

async function resolveWithFallback<T>(
  primaryLookup: () => Promise<T>,
  fallbackLookup: () => Promise<T>,
) {
  try {
    return await primaryLookup();
  } catch (error) {
    if (classifyDnsError(error) === "RECORD_NOT_FOUND") {
      throw error;
    }

    return fallbackLookup();
  }
}

const defaultResolver: DnsResolver = {
  resolveMx: (domain) =>
    resolveWithFallback(
      () => resolveMx(domain),
      () => fallbackResolver.resolveMx(domain),
    ),
  resolveTxt: (domain) =>
    resolveWithFallback(
      () => resolveTxt(domain),
      () => fallbackResolver.resolveTxt(domain),
    ),
};

function normalizeDomain(domain: string) {
  return domain.trim().replace(/\.$/, "").toLowerCase();
}

function fallbackDomainFromUrl(url: string) {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return normalizeDomain(url);
  }
}

function getDomain(input: ScanEmailSecurityInput) {
  return normalizeDomain(
    input.rootDomain || fallbackDomainFromUrl(input.normalizedUrl || input.targetUrl),
  );
}

function getDnsErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;

    return typeof code === "string" ? code.toUpperCase() : null;
  }

  return null;
}

export function classifyDnsError(error: unknown): DnsErrorClassification {
  const code = getDnsErrorCode(error);

  if (
    code === "ENODATA" ||
    code === "ENOTFOUND" ||
    code === "ENODOMAIN" ||
    code === "NODATA" ||
    code === "NOTFOUND" ||
    code === "NXDOMAIN"
  ) {
    return "RECORD_NOT_FOUND";
  }

  return "DNS_LOOKUP_FAILED";
}

function createCheckCompletedLog(
  check: string,
  status: string,
  metadata: Record<string, unknown>,
): EmailSecurityScannerLog {
  return {
    level: status === "Failed" ? "WARN" : "INFO",
    message: `${check} check completed`,
    metadata: {
      status,
      ...metadata,
    },
  };
}

async function lookupMx(
  resolver: DnsResolver,
  domain: string,
): Promise<DnsLookupResult<EmailSecurityMxRecord[]>> {
  try {
    const records = await resolver.resolveMx(domain);

    return {
      classification: null,
      error: null,
      records,
    };
  } catch (error) {
    return {
      classification: classifyDnsError(error),
      error,
      records: [],
    };
  }
}

function flattenTxtRecords(records: string[][]) {
  return records
    .map((chunks) => chunks.join("").trim())
    .filter((record) => record.length > 0);
}

async function lookupTxt(
  resolver: DnsResolver,
  domain: string,
): Promise<DnsLookupResult<string[]>> {
  try {
    const records = flattenTxtRecords(await resolver.resolveTxt(domain));

    return {
      classification: null,
      error: null,
      records,
    };
  } catch (error) {
    return {
      classification: classifyDnsError(error),
      error,
      records: [],
    };
  }
}

function createFinding(
  scanId: string,
  input: Omit<EmailSecurityFinding, "category" | "scanId">,
): EmailSecurityFinding {
  return {
    scanId,
    category: EMAIL_SECURITY_CATEGORY,
    ...input,
  };
}

function findSpfRecords(txtRecords: string[]) {
  return txtRecords.filter((record) => record.toLowerCase().startsWith("v=spf1"));
}

function findDmarcRecords(txtRecords: string[]) {
  return txtRecords.filter((record) =>
    record.toLowerCase().startsWith("v=dmarc1"),
  );
}

function extractDmarcPolicy(record: string | null) {
  if (!record) {
    return null;
  }

  const policy = record.match(/(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\b/i);

  return policy?.[1]?.toLowerCase() ?? null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAllMechanism(record: string, mechanism: "+all" | "?all" | "~all" | "-all") {
  return new RegExp(`(?:^|\\s)${escapeRegExp(mechanism)}(?=\\s|$)`, "i").test(
    record,
  );
}

function analyzeMx(input: {
  lookup: DnsLookupResult<EmailSecurityMxRecord[]>;
  summary: EmailSecuritySummary;
}) {
  if (input.lookup.classification === "DNS_LOOKUP_FAILED") {
    input.summary.mxError = "MX DNS lookup failed.";
    return;
  }

  input.summary.mxRecords = [...input.lookup.records].sort(
    (first, second) => first.priority - second.priority,
  );
  input.summary.mxFound = input.summary.mxRecords.length > 0;
}

function hasStrictEmailSendPolicy(summary: EmailSecuritySummary) {
  return (
    summary.spfAssessment === "Strict fail (-all)" &&
    (summary.dmarcPolicy === "reject" || summary.dmarcPolicy === "quarantine")
  );
}

function addMxFinding(input: {
  findings: EmailSecurityFinding[];
  scanId: string;
  summary: EmailSecuritySummary;
}) {
  if (input.summary.mxError || input.summary.mxFound) {
    return;
  }

  const strictSendPolicy = hasStrictEmailSendPolicy(input.summary);

  input.findings.push(
    createFinding(input.scanId, {
      confidence: "HIGH",
      evidence: strictSendPolicy
        ? `No MX records were found, while SPF uses -all and DMARC policy is ${input.summary.dmarcPolicy}.`
        : "No MX records were found for the domain.",
      fix: "Publish MX records for the domain if it is expected to receive business email.",
      impact: strictSendPolicy
        ? "The domain may intentionally not receive email."
        : "Email delivery and domain trust signals may be weaker when mail exchange records are absent.",
      owaspMapping: OWASP_EMAIL_MAPPING,
      severity: strictSendPolicy ? "INFO" : "MEDIUM",
      title: strictSendPolicy
        ? "Domain appears configured not to receive mail"
        : "Missing MX records",
    }),
  );
}

function analyzeSpf(input: {
  findings: EmailSecurityFinding[];
  lookup: DnsLookupResult<string[]>;
  scanId: string;
  summary: EmailSecuritySummary;
}) {
  if (input.lookup.classification === "DNS_LOOKUP_FAILED") {
    input.summary.spfAssessment = "Lookup failed";
    input.summary.spfError = "SPF DNS lookup failed.";
    return;
  }

  const spfRecords = findSpfRecords(input.lookup.records);
  input.summary.spfFound = spfRecords.length > 0;
  input.summary.spfRecord =
    spfRecords.length > 0 ? spfRecords.join(" | ") : null;

  if (spfRecords.length === 0) {
    input.summary.spfAssessment = "Missing";
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: "No SPF TXT record starting with v=spf1 was found.",
        fix: "Publish a valid SPF TXT record that lists authorized mail senders.",
        impact:
          "Email receivers have less information to verify authorized senders for this domain.",
        owaspMapping: OWASP_EMAIL_MAPPING,
        severity: "MEDIUM",
        title: "Missing SPF record",
      }),
    );
    return;
  }

  if (spfRecords.length > 1) {
    input.summary.spfAssessment = "Multiple SPF records";
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence:
          "Multiple SPF records were found. Domains should publish only one SPF record.",
        fix: "Merge SPF mechanisms into a single valid v=spf1 TXT record.",
        impact:
          "Multiple SPF records can cause SPF evaluation errors and reduce mail authentication reliability.",
        owaspMapping: OWASP_EMAIL_MAPPING,
        severity: "MEDIUM",
        title: "Multiple SPF records found",
      }),
    );
    return;
  }

  const [spfRecord] = spfRecords;

  if (hasAllMechanism(spfRecord, "+all")) {
    input.summary.spfAssessment = "Allows any sender (+all)";
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: "SPF record contains +all, which allows any sender.",
        fix: "Replace +all with a restrictive all mechanism after confirming authorized senders.",
        impact:
          "Any sender can pass SPF for the domain, increasing spoofing and phishing risk.",
        owaspMapping: OWASP_EMAIL_MAPPING,
        severity: "HIGH",
        title: "SPF record allows any sender",
      }),
    );
    return;
  }

  if (hasAllMechanism(spfRecord, "?all")) {
    input.summary.spfAssessment = "Neutral policy (?all)";
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "MEDIUM",
        evidence:
          "SPF record uses ?all, which is neutral and weak for enforcement.",
        fix: "Use a stricter SPF all mechanism after validating authorized senders.",
        impact:
          "Neutral SPF handling gives receivers weaker guidance when messages are not from listed senders.",
        owaspMapping: "Security Misconfiguration",
        severity: "LOW",
        title: "SPF record uses neutral all policy",
      }),
    );
    return;
  }

  if (hasAllMechanism(spfRecord, "~all")) {
    input.summary.spfAssessment = "Softfail (~all)";
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "MEDIUM",
        evidence: "SPF record uses ~all softfail.",
        fix: "Consider moving to -all after confirming all legitimate senders are included.",
        impact:
          "Softfail is useful during rollout but is less strict than a hard fail policy.",
        owaspMapping: "Security Misconfiguration",
        severity: "INFO",
        title: "SPF record uses softfail",
      }),
    );
    return;
  }

  input.summary.spfAssessment = hasAllMechanism(spfRecord, "-all")
    ? "Strict fail (-all)"
    : "SPF record present";
}

function analyzeDmarc(input: {
  findings: EmailSecurityFinding[];
  lookup: DnsLookupResult<string[]>;
  scanId: string;
  summary: EmailSecuritySummary;
}) {
  const dmarcDomain = `_dmarc.${input.summary.domain}`;

  if (input.lookup.classification === "DNS_LOOKUP_FAILED") {
    input.summary.dmarcError = "DMARC DNS lookup failed.";
    return;
  }

  const dmarcRecords = findDmarcRecords(input.lookup.records);
  input.summary.dmarcFound = dmarcRecords.length > 0;
  input.summary.dmarcRecord = dmarcRecords[0] ?? null;
  input.summary.dmarcPolicy = extractDmarcPolicy(input.summary.dmarcRecord);

  if (!input.summary.dmarcFound) {
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: `No DMARC record was found at ${dmarcDomain}.`,
        fix: `Publish a DMARC record at ${dmarcDomain} with an appropriate policy.`,
        impact:
          "The domain has weaker protection against spoofing and phishing abuse.",
        owaspMapping: OWASP_EMAIL_MAPPING,
        severity: "MEDIUM",
        title: "Missing DMARC record",
      }),
    );
    return;
  }

  if (input.summary.dmarcPolicy === "none") {
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "HIGH",
        evidence: "DMARC policy is set to p=none, which is monitoring-only.",
        fix: "Move DMARC toward p=quarantine or p=reject after reviewing reports and confirming legitimate senders.",
        impact:
          "Monitoring-only DMARC does not ask receivers to quarantine or reject unauthenticated mail.",
        owaspMapping: "Security Misconfiguration",
        severity: "LOW",
        title: "DMARC policy is monitoring-only",
      }),
    );
    return;
  }

  if (!input.summary.dmarcPolicy) {
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "MEDIUM",
        evidence: "DMARC record exists but no clear p= policy was found.",
        fix: "Add an explicit p=none, p=quarantine, or p=reject policy to the DMARC record.",
        impact:
          "Receivers may not have a clear domain-level DMARC policy to apply.",
        owaspMapping: "Security Misconfiguration",
        severity: "LOW",
        title: "DMARC record has no clear policy",
      }),
    );
  }
}

async function analyzeDkim(input: {
  findings: EmailSecurityFinding[];
  resolver: DnsResolver;
  scanId: string;
  summary: EmailSecuritySummary;
}) {
  for (const selector of EMAIL_DKIM_SELECTORS) {
    const selectorDomain = `${selector}._domainkey.${input.summary.domain}`;
    const lookup = await lookupTxt(input.resolver, selectorDomain);

    if (lookup.classification === "DNS_LOOKUP_FAILED") {
      input.summary.dkimErrorCount += 1;
      continue;
    }

    const hasDkimRecord = lookup.records.some((record) =>
      record.toLowerCase().includes("v=dkim1"),
    );

    if (hasDkimRecord) {
      input.summary.dkimSelectorsFound.push(selector);
    }
  }

  if (
    input.summary.dkimSelectorsFound.length === 0 &&
    input.summary.dkimErrorCount === 0
  ) {
    input.findings.push(
      createFinding(input.scanId, {
        confidence: "LOW",
        evidence:
          "No DKIM record was found for the common selectors tested. DKIM may still exist under a different selector.",
        fix: "Confirm the active DKIM selector from the mail provider and publish the DKIM TXT record if missing.",
        impact:
          "DKIM status could not be confirmed using common selectors.",
        owaspMapping: OWASP_EMAIL_MAPPING,
        severity: "INFO",
        title: "No DKIM record found for common selectors tested",
      }),
    );
  }
}

function createBaseSummary(domain: string, checkedAt: string): EmailSecuritySummary {
  return {
    checkedAt,
    dkimErrorCount: 0,
    dkimSelectorsFound: [],
    dkimSelectorsTested: [...EMAIL_DKIM_SELECTORS],
    dmarcError: null,
    dmarcFound: false,
    dmarcPolicy: null,
    dmarcRecord: null,
    domain,
    mxError: null,
    mxFound: false,
    mxRecords: [],
    spfAssessment: "Not checked",
    spfError: null,
    spfFound: false,
    spfRecord: null,
  };
}

function getMxCheckStatus(summary: EmailSecuritySummary) {
  if (summary.mxError) {
    return "Failed";
  }

  return summary.mxFound ? "Present" : "Missing";
}

function getSpfCheckStatus(summary: EmailSecuritySummary) {
  if (summary.spfError) {
    return "Failed";
  }

  if (!summary.spfFound) {
    return "Missing";
  }

  return summary.spfAssessment === "Strict fail (-all)" ||
    summary.spfAssessment === "SPF record present"
    ? "Present"
    : "Weak";
}

function getDmarcCheckStatus(summary: EmailSecuritySummary) {
  if (summary.dmarcError) {
    return "Failed";
  }

  if (!summary.dmarcFound) {
    return "Missing";
  }

  return summary.dmarcPolicy === "quarantine" || summary.dmarcPolicy === "reject"
    ? "Present"
    : "Weak";
}

function getDkimCheckStatus(summary: EmailSecuritySummary) {
  if (summary.dkimSelectorsFound.length > 0) {
    return "Present";
  }

  if (summary.dkimErrorCount > 0) {
    return "Failed";
  }

  return "Not found for common selectors";
}

export async function scanEmailSecurity(
  input: ScanEmailSecurityInput,
  dependencies: ScanEmailSecurityDependencies = {},
): Promise<ScanEmailSecurityResult> {
  const domain = getDomain(input);
  const checkedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const resolver = dependencies.resolver ?? defaultResolver;
  const findings: EmailSecurityFinding[] = [];
  const logs: EmailSecurityScannerLog[] = [];
  const summary = createBaseSummary(domain, checkedAt);
  const mxLookup = await lookupMx(resolver, domain);

  analyzeMx({
    lookup: mxLookup,
    summary,
  });
  logs.push(
    createCheckCompletedLog("MX", getMxCheckStatus(summary), {
      classification: mxLookup.classification,
      domain,
      mxRecordCount: summary.mxRecords.length,
    }),
  );

  const spfLookup = await lookupTxt(resolver, domain);

  analyzeSpf({
    findings,
    lookup: spfLookup,
    scanId: input.scanId,
    summary,
  });
  logs.push(
    createCheckCompletedLog("SPF", getSpfCheckStatus(summary), {
      assessment: summary.spfAssessment,
      classification: spfLookup.classification,
      domain,
      spfFound: summary.spfFound,
    }),
  );

  const dmarcDomain = `_dmarc.${domain}`;
  const dmarcLookup = await lookupTxt(resolver, dmarcDomain);

  analyzeDmarc({
    findings,
    lookup: dmarcLookup,
    scanId: input.scanId,
    summary,
  });
  logs.push(
    createCheckCompletedLog("DMARC", getDmarcCheckStatus(summary), {
      classification: dmarcLookup.classification,
      dmarcFound: summary.dmarcFound,
      dmarcPolicy: summary.dmarcPolicy,
      domain: dmarcDomain,
    }),
  );
  addMxFinding({
    findings,
    scanId: input.scanId,
    summary,
  });

  await analyzeDkim({
    findings,
    resolver,
    scanId: input.scanId,
    summary,
  });
  logs.push(
    createCheckCompletedLog(
      "DKIM common selector",
      getDkimCheckStatus(summary),
      {
        dkimErrorCount: summary.dkimErrorCount,
        selectorsFound: summary.dkimSelectorsFound,
        selectorsTested: summary.dkimSelectorsTested,
      },
    ),
  );

  return {
    emailSecuritySummary: summary,
    findings,
    logs,
  };
}
