import { EMAIL_SECURITY_CATEGORY } from "../scanners/emailSecurityScanner.ts";
import {
  HTTP_SECURITY_HEADER_NAMES,
  type HeaderCheckStatus,
  type HttpSecurityHeaderName,
} from "../scanners/httpHeadersScanner.ts";
import {
  OWASP_CHECKLIST_LOG_METADATA_KEY,
  owaspChecklistCategories,
  type OwaspChecklistItem,
  type OwaspChecklistRelatedFinding,
  type OwaspChecklistStatus,
  type RemediationPriority,
  type RemediationSummary,
  type RemediationSummaryItem,
} from "../scanners/owaspChecklistBuilder.ts";
import { SSL_TLS_CATEGORY } from "../scanners/sslTlsScanner.ts";
import { TECH_DETECTION_CATEGORY } from "../scanners/techDetectionScanner.ts";
import {
  buildScoreExplanation,
  calculateCategoryScores,
  calculateSeverityCounts,
  severityOrder,
  type CategoryScore,
  type FindingSeverity,
  type Grade,
  type ScoreExplanation,
  type SeverityCounts,
} from "../security/scoringEngine.ts";

export class ReportGenerationError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "NOT_COMPLETED"
    | "MISSING_SCORE"
    | "UNAUTHORIZED"
    | "PLAN_ACCESS_DENIED"
    | "NO_CREDITS"
    | "PDF_FAILED";

  constructor(
    message: string,
    code:
      | "NOT_FOUND"
      | "NOT_COMPLETED"
      | "MISSING_SCORE"
      | "UNAUTHORIZED"
      | "PLAN_ACCESS_DENIED"
      | "NO_CREDITS"
      | "PDF_FAILED",
  ) {
    super(message);
    this.code = code;
  }
}

export type ReportFinding = {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: string;
  owaspMapping: string | null;
  evidence: string | null;
  impact: string | null;
  fix: string | null;
  confidence: string;
  createdAt: Date;
};

export type HeaderSummary = {
  findingTitles: string[];
  name: HttpSecurityHeaderName;
  note: string | null;
  status: HeaderCheckStatus;
};

export type SslSummary = {
  authorizationError: string | null;
  certificateExists: boolean;
  certificateValid: boolean | null;
  daysUntilExpiry: number | null;
  expired: boolean | null;
  hostnameMatched: boolean | null;
  httpRedirectFinalUrl: string | null;
  httpRedirectsToHttps: boolean | null;
  httpsAvailable: boolean;
  httpsError: string | null;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
};

export type EmailSummary = {
  dkimErrorCount: number;
  dkimSelectorsFound: string[];
  dkimSelectorsTested: string[];
  dmarcFound: boolean;
  dmarcPolicy: string | null;
  dmarcRecord: string | null;
  domain: string;
  mxFound: boolean;
  mxRecords: Array<{ exchange: string; priority: number }>;
  spfAssessment: string;
  spfFound: boolean;
  spfRecord: string | null;
};

export type TechExposedPathCheck = {
  confidence: string | null;
  error: string | null;
  evidence: string | null;
  findingTitle: string | null;
  path: string;
  status:
    | "Reachable"
    | "Redirected"
    | "Forbidden"
    | "Inconclusive"
    | "Not found"
    | "Check failed";
  statusCode: number | null;
  url: string;
};

export type TechSummary = {
  exposedPathChecks: TechExposedPathCheck[];
  homepageFinalUrl: string | null;
  homepageStatusCode: number | null;
  serverHeader: string | null;
  technologiesDetected: string[];
  woocommerceDetected: boolean;
  woocommerceEvidence: string[];
  wordpressDetected: boolean;
  wordpressEvidence: string[];
  xmlRpcAccessible: boolean;
  xmlRpcEvidence: string | null;
};

export type ReportData = {
  scan: {
    id: string;
    scanType: "BASIC" | "PROFESSIONAL";
    targetUrl: string;
    normalizedUrl: string;
    rootDomain: string;
    status: string;
    score: number;
    grade: Grade;
    createdAt: Date;
    completedAt: Date | null;
  };
  findings: ReportFinding[];
  severityCounts: SeverityCounts;
  categoryScores: CategoryScore[];
  scoreExplanation: ScoreExplanation;
  owaspChecklistItems: OwaspChecklistItem[];
  remediationSummary: RemediationSummary | null;
  headerSummary: HeaderSummary[];
  sslSummary: SslSummary | null;
  emailSummary: EmailSummary | null;
  techSummary: TechSummary | null;
};

type LogRecord = { message: string; metadata: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isFindingSeverity(value: unknown): value is FindingSeverity {
  return typeof value === "string" && severityOrder.includes(value as FindingSeverity);
}

function isGrade(value: string | null): value is Grade {
  return value === "A" || value === "B" || value === "C" || value === "D" || value === "F";
}

function isHeaderName(value: unknown): value is HttpSecurityHeaderName {
  return (
    typeof value === "string" &&
    HTTP_SECURITY_HEADER_NAMES.includes(value as HttpSecurityHeaderName)
  );
}

function isHeaderStatus(value: unknown): value is HeaderCheckStatus {
  return value === "Present" || value === "Missing" || value === "Weak" || value === "Not checked";
}

function parseHeaderSummaryItem(value: unknown): HeaderSummary | null {
  if (!isRecord(value) || !isHeaderName(value.name) || !isHeaderStatus(value.status)) {
    return null;
  }

  return {
    findingTitles: Array.isArray(value.findingTitles)
      ? value.findingTitles.filter((title): title is string => typeof title === "string")
      : [],
    name: value.name,
    note: optionalString(value.note),
    status: value.status,
  };
}

function parseMxRecords(value: unknown): EmailSummary["mxRecords"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const exchange = optionalString(item.exchange);
    const priority = optionalNumber(item.priority);

    return exchange && priority !== null ? [{ exchange, priority }] : [];
  });
}

function parseEmailSummary(value: unknown): EmailSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const domain = optionalString(value.domain);

  if (!domain) {
    return null;
  }

  return {
    dkimErrorCount: optionalNumber(value.dkimErrorCount) ?? 0,
    dkimSelectorsFound: optionalStringArray(value.dkimSelectorsFound),
    dkimSelectorsTested: optionalStringArray(value.dkimSelectorsTested),
    dmarcFound: optionalBoolean(value.dmarcFound) ?? false,
    dmarcPolicy: optionalString(value.dmarcPolicy),
    dmarcRecord: optionalString(value.dmarcRecord),
    domain,
    mxFound: optionalBoolean(value.mxFound) ?? false,
    mxRecords: parseMxRecords(value.mxRecords),
    spfAssessment: optionalString(value.spfAssessment) ?? "Not checked",
    spfFound: optionalBoolean(value.spfFound) ?? false,
    spfRecord: optionalString(value.spfRecord),
  };
}

function parseSslSummary(value: unknown): SslSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const httpsAvailable = optionalBoolean(value.httpsAvailable);

  if (httpsAvailable === null) {
    return null;
  }

  return {
    authorizationError: optionalString(value.authorizationError),
    certificateExists: optionalBoolean(value.certificateExists) ?? false,
    certificateValid: optionalBoolean(value.certificateValid),
    daysUntilExpiry: optionalNumber(value.daysUntilExpiry),
    expired: optionalBoolean(value.expired),
    hostnameMatched: optionalBoolean(value.hostnameMatched),
    httpRedirectFinalUrl: optionalString(value.httpRedirectFinalUrl),
    httpRedirectsToHttps: optionalBoolean(value.httpRedirectsToHttps),
    httpsAvailable,
    httpsError: optionalString(value.httpsError),
    issuer: optionalString(value.issuer),
    subject: optionalString(value.subject),
    validFrom: optionalString(value.validFrom),
    validTo: optionalString(value.validTo),
  };
}

function isTechPathStatus(value: unknown): value is TechExposedPathCheck["status"] {
  return (
    value === "Reachable" ||
    value === "Redirected" ||
    value === "Forbidden" ||
    value === "Inconclusive" ||
    value === "Not found" ||
    value === "Check failed"
  );
}

function parseTechPath(value: unknown): TechExposedPathCheck | null {
  if (!isRecord(value) || !isTechPathStatus(value.status)) {
    return null;
  }

  const path = optionalString(value.path);
  const url = optionalString(value.url);

  if (!path || !url) {
    return null;
  }

  return {
    confidence: optionalString(value.confidence),
    error: optionalString(value.error),
    evidence: optionalString(value.evidence),
    findingTitle: optionalString(value.findingTitle),
    path,
    status: value.status,
    statusCode: value.statusCode === null ? null : optionalNumber(value.statusCode),
    url,
  };
}

function parseTechSummary(value: unknown): TechSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    exposedPathChecks: Array.isArray(value.exposedPathChecks)
      ? value.exposedPathChecks
          .map(parseTechPath)
          .filter((item): item is TechExposedPathCheck => item !== null)
      : [],
    homepageFinalUrl: optionalString(value.homepageFinalUrl),
    homepageStatusCode:
      value.homepageStatusCode === null ? null : optionalNumber(value.homepageStatusCode),
    serverHeader: optionalString(value.serverHeader),
    technologiesDetected: optionalStringArray(value.technologiesDetected),
    woocommerceDetected: optionalBoolean(value.woocommerceDetected) ?? false,
    woocommerceEvidence: optionalStringArray(value.woocommerceEvidence),
    wordpressDetected: optionalBoolean(value.wordpressDetected) ?? false,
    wordpressEvidence: optionalStringArray(value.wordpressEvidence),
    xmlRpcAccessible: optionalBoolean(value.xmlRpcAccessible) ?? false,
    xmlRpcEvidence: optionalString(value.xmlRpcEvidence),
  };
}

function isOwaspStatus(value: unknown): value is OwaspChecklistStatus {
  return (
    value === "PASSED" ||
    value === "ATTENTION_REQUIRED" ||
    value === "OBSERVATION" ||
    value === "NOT_CHECKED"
  );
}

function isOwaspCategoryName(value: unknown): value is OwaspChecklistItem["categoryName"] {
  return (
    typeof value === "string" &&
    owaspChecklistCategories.includes(value as OwaspChecklistItem["categoryName"])
  );
}

function parseRelatedFinding(value: unknown): OwaspChecklistRelatedFinding | null {
  if (!isRecord(value) || !isFindingSeverity(value.severity)) {
    return null;
  }

  const title = optionalString(value.title);
  const category = optionalString(value.category);

  if (!title || !category) {
    return null;
  }

  return {
    category,
    evidence: optionalString(value.evidence),
    fix: optionalString(value.fix),
    id: optionalString(value.id) ?? undefined,
    severity: value.severity,
    title,
  };
}

function parseOwaspItem(value: unknown): OwaspChecklistItem | null {
  if (!isRecord(value) || !isOwaspCategoryName(value.categoryName) || !isOwaspStatus(value.status)) {
    return null;
  }

  return {
    categoryName: value.categoryName,
    evidenceSummary: optionalString(value.evidenceSummary) ?? "-",
    limitationNote: optionalString(value.limitationNote) ?? "-",
    recommendation: optionalString(value.recommendation) ?? "-",
    relatedFindings: Array.isArray(value.relatedFindings)
      ? value.relatedFindings
          .map(parseRelatedFinding)
          .filter((finding): finding is OwaspChecklistRelatedFinding => finding !== null)
      : [],
    severitySummary: optionalString(value.severitySummary) ?? "-",
    status: value.status,
  };
}

function parseRemediationItem(value: unknown): RemediationSummaryItem | null {
  if (!isRecord(value) || !isFindingSeverity(value.severity)) {
    return null;
  }

  const title = optionalString(value.title);
  const category = optionalString(value.category);
  const recommendation = optionalString(value.recommendation);

  return title && category && recommendation
    ? { category, recommendation, severity: value.severity, title }
    : null;
}

function parseRemediationGroup(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(parseRemediationItem)
        .filter((item): item is RemediationSummaryItem => item !== null)
    : [];
}

function parseRemediationSummary(value: unknown): RemediationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    immediateAttention: parseRemediationGroup(value.immediateAttention),
    informationalObservations: parseRemediationGroup(value.informationalObservations),
    manualReview: parseRemediationGroup(value.manualReview),
    recommendedHardening: parseRemediationGroup(value.recommendedHardening),
  };
}

function getLatestFromLogs<T>(
  logs: LogRecord[],
  message: string,
  parser: (metadata: Record<string, unknown>) => T | null,
) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];

    if (log.message !== message || !isRecord(log.metadata)) {
      continue;
    }

    const parsed = parser(log.metadata);

    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function getOwaspSummary(logs: LogRecord[]) {
  return getLatestFromLogs(logs, "OWASP checklist builder completed", (metadata) => {
    const summary = metadata[OWASP_CHECKLIST_LOG_METADATA_KEY];

    if (!isRecord(summary) || !Array.isArray(summary.checklistItems)) {
      return null;
    }

    const checklistItems = summary.checklistItems
      .map(parseOwaspItem)
      .filter((item): item is OwaspChecklistItem => item !== null);
    const remediationSummary = parseRemediationSummary(summary.remediationSummary);

    return checklistItems.length > 0 && remediationSummary
      ? { checklistItems, remediationSummary }
      : null;
  });
}

export const remediationGroups: Array<{ key: RemediationPriority; title: string }> = [
  { key: "immediateAttention", title: "Immediate attention" },
  { key: "recommendedHardening", title: "Recommended hardening" },
  { key: "informationalObservations", title: "Informational observations" },
  { key: "manualReview", title: "Not checked / requires manual review" },
];

export async function buildReportData(scanId: string, userId: string): Promise<ReportData> {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, userId },
    include: {
      findings: {
        orderBy: { createdAt: "asc" },
        select: {
          category: true,
          confidence: true,
          createdAt: true,
          evidence: true,
          fix: true,
          id: true,
          impact: true,
          owaspMapping: true,
          severity: true,
          title: true,
        },
      },
      logs: {
        orderBy: { createdAt: "asc" },
        select: {
          message: true,
          metadata: true,
        },
      },
    },
  });

  if (!scan) {
    throw new ReportGenerationError("Scan was not found.", "NOT_FOUND");
  }

  if (scan.userId !== userId) {
    throw new ReportGenerationError("You cannot generate this report.", "UNAUTHORIZED");
  }

  if (scan.status !== "COMPLETED") {
    throw new ReportGenerationError("PDF reports can only be generated for completed scans.", "NOT_COMPLETED");
  }

  if (scan.score === null || !isGrade(scan.grade)) {
    throw new ReportGenerationError("Completed scan is missing saved score or grade.", "MISSING_SCORE");
  }

  const findings = [...scan.findings].sort(
    (first, second) =>
      severityOrder.indexOf(first.severity) - severityOrder.indexOf(second.severity) ||
      first.createdAt.getTime() - second.createdAt.getTime(),
  );
  const logs = scan.logs as LogRecord[];
  const owaspSummary = getOwaspSummary(logs);
  const headerSummary =
    getLatestFromLogs(logs, "HTTP headers scanner completed", (metadata) => {
      const headerSummaryValue = metadata.headerSummary;

      if (!Array.isArray(headerSummaryValue)) {
        return null;
      }

      const parsed = headerSummaryValue
        .map(parseHeaderSummaryItem)
        .filter((item): item is HeaderSummary => item !== null);

      return parsed.length > 0 ? parsed : null;
    }) ?? [];

  return {
    categoryScores: calculateCategoryScores(findings),
    emailSummary: getLatestFromLogs(logs, "Email security scanner completed", (metadata) =>
      parseEmailSummary(metadata.emailSecuritySummary),
    ),
    findings,
    headerSummary,
    owaspChecklistItems: owaspSummary?.checklistItems ?? [],
    remediationSummary: owaspSummary?.remediationSummary ?? null,
    scan: {
      completedAt: scan.completedAt,
      createdAt: scan.createdAt,
      grade: scan.grade,
      id: scan.id,
      normalizedUrl: scan.normalizedUrl,
      rootDomain: scan.rootDomain,
      scanType: scan.scanType === "BASIC" ? "BASIC" : "PROFESSIONAL",
      score: scan.score,
      status: scan.status,
      targetUrl: scan.targetUrl,
    },
    scoreExplanation: buildScoreExplanation(findings, scan.score, scan.grade),
    severityCounts: calculateSeverityCounts(findings),
    sslSummary: getLatestFromLogs(logs, "SSL/TLS scanner completed", (metadata) =>
      parseSslSummary(metadata.sslSummary),
    ),
    techSummary: getLatestFromLogs(logs, "Tech detection scanner completed", (metadata) =>
      parseTechSummary(metadata.techDetectionSummary),
    ),
  };
}

export { EMAIL_SECURITY_CATEGORY, SSL_TLS_CATEGORY, TECH_DETECTION_CATEGORY };
