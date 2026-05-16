import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  Globe,
  ListChecks,
  ShieldCheck,
  Timer,
} from "lucide-react";

import { ScanAutoRefresh } from "@/components/scans/scan-auto-refresh";
import { ReportActions } from "@/components/reports/report-actions";
import { ScanClientAssignment } from "@/components/clients/scan-client-assignment";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { canManageClients, getUserCredits } from "@/lib/billing";
import { getPrisma } from "@/lib/prisma";
import {
  EMAIL_SECURITY_CATEGORY,
  type EmailSecurityMxRecord,
  type EmailSecuritySummary,
} from "@/lib/scanners/emailSecurityScanner";
import {
  HTTP_SECURITY_HEADER_NAMES,
  type HeaderCheckStatus,
  type HttpSecurityHeaderName,
} from "@/lib/scanners/httpHeadersScanner";
import {
  OWASP_CHECKLIST_LOG_METADATA_KEY,
  owaspChecklistCategories,
  type OwaspChecklistItem,
  type OwaspChecklistRelatedFinding,
  type OwaspChecklistStatus,
  type RemediationPriority,
  type RemediationSummary,
  type RemediationSummaryItem,
} from "@/lib/scanners/owaspChecklistBuilder";
import {
  SSL_TLS_CATEGORY,
  type SslTlsSummary,
} from "@/lib/scanners/sslTlsScanner";
import { TECH_DETECTION_CATEGORY } from "@/lib/scanners/techDetectionScanner";
import {
  buildPriorityFixList,
  buildScoreExplanation,
  calculateCategoryScores,
  calculateGrade,
  calculateRiskScore,
  type Grade,
} from "@/lib/security/scoringEngine";

export const metadata: Metadata = {
  title: "Scan Details",
  description: "Scan detail shell.",
};

const lifecycleStatuses = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];
const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const sectionLinks = [
  ["Overview", "overview"],
  ["Score", "score"],
  ["Findings", "findings"],
  ["OWASP Checklist", "owasp-checklist"],
  ["Remediation", "remediation"],
  ["Headers", "headers"],
  ["SSL/TLS", "ssl-tls"],
  ["Email Security", "email-security"],
  ["Tech Detection", "tech-detection"],
  ["Logs", "logs"],
] as const;
const severityMeanings: Record<FindingSeverity, string> = {
  CRITICAL: "Immediate business-impacting risk if confirmed.",
  HIGH: "Important exposure that should be prioritized.",
  MEDIUM: "Meaningful weakness or missing hardening control.",
  LOW: "Hardening opportunity with limited direct impact.",
  INFO: "Observation only; does not reduce the score.",
};
const remediationGroups: Array<{
  key: RemediationPriority;
  title: string;
  emptyText: string;
}> = [
  {
    emptyText: "No critical, high, or medium findings are currently grouped here.",
    key: "immediateAttention",
    title: "Immediate attention",
  },
  {
    emptyText: "No low-severity hardening recommendations are currently grouped here.",
    key: "recommendedHardening",
    title: "Recommended hardening",
  },
  {
    emptyText: "No informational observations are currently grouped here.",
    key: "informationalObservations",
    title: "Informational observations",
  },
  {
    emptyText: "No manual review categories are currently grouped here.",
    key: "manualReview",
    title: "Not checked / requires manual review",
  },
];

type FindingSeverity = (typeof severityOrder)[number];

type ScanFinding = {
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

type HeaderSummaryFromLog = {
  findingTitles: string[];
  name: HttpSecurityHeaderName;
  note?: string | null;
  status: HeaderCheckStatus;
};

type EmailSecurityStatus =
  | HeaderCheckStatus
  | "Failed"
  | "Critical"
  | "High"
  | "Attention"
  | "Hardening"
  | "Observation";

type EmailSecurityCard = {
  detail: string;
  label: string;
  status: EmailSecurityStatus;
  wrap?: "break-all" | "break-words";
};

type SslStatus =
  | "Available"
  | "Missing"
  | "Valid"
  | "Expired"
  | "Warning"
  | "Not checked";

type SslTlsRow = {
  detail: string;
  label: string;
  relatedFindingTitles: string[];
  status: SslStatus;
};

type TechDetectionStatus =
  | "Detected"
  | "Not detected"
  | "Accessible"
  | "Not accessible"
  | "Observed"
  | "Not observed"
  | "Not checked"
  | "Version exposed";

type TechExposedPathStatus =
  | "Reachable"
  | "Redirected"
  | "Forbidden"
  | "Inconclusive"
  | "Not found"
  | "Check failed";

type TechDetectionCard = {
  detail: string;
  label: string;
  status: TechDetectionStatus;
  wrap?: "break-all" | "break-words";
};

type TechExposedPathCheck = {
  confidence: string | null;
  error: string | null;
  evidence: string | null;
  findingTitle: string | null;
  path: string;
  status: TechExposedPathStatus;
  statusCode: number | null;
  url: string;
};

type TechDetectionSummaryFromLog = {
  checkedAt: string;
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

function formatDate(date: Date | null) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusVariant(status: string) {
  if (status === "COMPLETED") {
    return "success" as const;
  }

  if (status === "FAILED") {
    return "destructive" as const;
  }

  if (status === "RUNNING") {
    return "warning" as const;
  }

  return "outline" as const;
}

function logLevelVariant(level: string) {
  if (level === "ERROR") {
    return "destructive" as const;
  }

  if (level === "WARN") {
    return "warning" as const;
  }

  return "outline" as const;
}

function severityVariant(severity: string) {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "destructive" as const;
  }

  if (severity === "MEDIUM") {
    return "warning" as const;
  }

  if (severity === "INFO") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function isGrade(value: string | null): value is Grade {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "F"
  );
}

function owaspStatusVariant(status: OwaspChecklistStatus) {
  if (status === "PASSED") {
    return "success" as const;
  }

  if (status === "ATTENTION_REQUIRED") {
    return "destructive" as const;
  }

  if (status === "OBSERVATION") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function headerStatusVariant(status: HeaderCheckStatus) {
  if (status === "Present") {
    return "success" as const;
  }

  if (status === "Missing") {
    return "destructive" as const;
  }

  if (status === "Weak") {
    return "warning" as const;
  }

  return "outline" as const;
}

function emailSecurityStatusVariant(status: EmailSecurityStatus) {
  if (status === "Present") {
    return "success" as const;
  }

  if (
    status === "Missing" ||
    status === "Failed" ||
    status === "Critical" ||
    status === "High"
  ) {
    return "destructive" as const;
  }

  if (status === "Weak" || status === "Attention" || status === "Hardening") {
    return "warning" as const;
  }

  if (status === "Observation") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function sslStatusVariant(status: SslStatus) {
  if (status === "Available" || status === "Valid") {
    return "success" as const;
  }

  if (status === "Expired" || status === "Missing") {
    return "destructive" as const;
  }

  if (status === "Warning") {
    return "warning" as const;
  }

  return "outline" as const;
}

function techDetectionStatusVariant(status: TechDetectionStatus) {
  if (
    status === "Not detected" ||
    status === "Not accessible" ||
    status === "Not observed"
  ) {
    return "success" as const;
  }

  if (status === "Accessible" || status === "Version exposed") {
    return "warning" as const;
  }

  if (status === "Detected" || status === "Observed") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function exposedPathStatusVariant(status: TechExposedPathStatus) {
  if (status === "Not found") {
    return "success" as const;
  }

  if (status === "Reachable" || status === "Redirected") {
    return "warning" as const;
  }

  if (status === "Check failed") {
    return "destructive" as const;
  }

  return "outline" as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHeaderStatus(value: unknown): value is HeaderCheckStatus {
  return (
    value === "Present" ||
    value === "Missing" ||
    value === "Weak" ||
    value === "Not checked"
  );
}

function isHeaderName(value: unknown): value is HttpSecurityHeaderName {
  return (
    typeof value === "string" &&
    HTTP_SECURITY_HEADER_NAMES.includes(value as HttpSecurityHeaderName)
  );
}

function parseHeaderSummaryItem(value: unknown): HeaderSummaryFromLog | null {
  if (!isRecord(value) || !isHeaderName(value.name) || !isHeaderStatus(value.status)) {
    return null;
  }

  const findingTitles = Array.isArray(value.findingTitles)
    ? value.findingTitles.filter((title): title is string => typeof title === "string")
    : [];

  return {
    findingTitles,
    name: value.name,
    note: typeof value.note === "string" ? value.note : null,
    status: value.status,
  };
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isFindingSeverity(value: unknown): value is FindingSeverity {
  return (
    typeof value === "string" && severityOrder.includes(value as FindingSeverity)
  );
}

function isOwaspChecklistStatus(value: unknown): value is OwaspChecklistStatus {
  return (
    value === "PASSED" ||
    value === "ATTENTION_REQUIRED" ||
    value === "OBSERVATION" ||
    value === "NOT_CHECKED"
  );
}

function isOwaspCategoryName(
  value: unknown,
): value is OwaspChecklistItem["categoryName"] {
  return (
    typeof value === "string" &&
    owaspChecklistCategories.includes(
      value as OwaspChecklistItem["categoryName"],
    )
  );
}

function parseOwaspRelatedFinding(
  value: unknown,
): OwaspChecklistRelatedFinding | null {
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

function parseOwaspChecklistItem(value: unknown): OwaspChecklistItem | null {
  if (
    !isRecord(value) ||
    !isOwaspCategoryName(value.categoryName) ||
    !isOwaspChecklistStatus(value.status)
  ) {
    return null;
  }

  const relatedFindings = Array.isArray(value.relatedFindings)
    ? value.relatedFindings
        .map(parseOwaspRelatedFinding)
        .filter((finding): finding is OwaspChecklistRelatedFinding => finding !== null)
    : [];

  return {
    categoryName: value.categoryName,
    evidenceSummary: optionalString(value.evidenceSummary) ?? "-",
    limitationNote: optionalString(value.limitationNote) ?? "-",
    recommendation: optionalString(value.recommendation) ?? "-",
    relatedFindings,
    severitySummary: optionalString(value.severitySummary) ?? "-",
    status: value.status,
  };
}

function parseRemediationSummaryItem(
  value: unknown,
): RemediationSummaryItem | null {
  if (!isRecord(value) || !isFindingSeverity(value.severity)) {
    return null;
  }

  const title = optionalString(value.title);
  const category = optionalString(value.category);
  const recommendation = optionalString(value.recommendation);

  if (!title || !category || !recommendation) {
    return null;
  }

  return {
    category,
    recommendation,
    severity: value.severity,
    title,
  };
}

function parseRemediationSummary(value: unknown): RemediationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    immediateAttention: Array.isArray(value.immediateAttention)
      ? value.immediateAttention
          .map(parseRemediationSummaryItem)
          .filter((item): item is RemediationSummaryItem => item !== null)
      : [],
    informationalObservations: Array.isArray(value.informationalObservations)
      ? value.informationalObservations
          .map(parseRemediationSummaryItem)
          .filter((item): item is RemediationSummaryItem => item !== null)
      : [],
    manualReview: Array.isArray(value.manualReview)
      ? value.manualReview
          .map(parseRemediationSummaryItem)
          .filter((item): item is RemediationSummaryItem => item !== null)
      : [],
    recommendedHardening: Array.isArray(value.recommendedHardening)
      ? value.recommendedHardening
          .map(parseRemediationSummaryItem)
          .filter((item): item is RemediationSummaryItem => item !== null)
      : [],
  };
}

function getLatestOwaspChecklistSummary(
  logs: Array<{ message: string; metadata: unknown }>,
) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];

    if (
      log.message !== "OWASP checklist builder completed" ||
      !isRecord(log.metadata)
    ) {
      continue;
    }

    const summary = log.metadata[OWASP_CHECKLIST_LOG_METADATA_KEY];

    if (!isRecord(summary) || !Array.isArray(summary.checklistItems)) {
      continue;
    }

    const checklistItems = summary.checklistItems
      .map(parseOwaspChecklistItem)
      .filter((item): item is OwaspChecklistItem => item !== null);
    const remediationSummary = parseRemediationSummary(
      summary.remediationSummary,
    );

    if (checklistItems.length > 0 && remediationSummary) {
      return {
        checklistItems,
        remediationSummary,
      };
    }
  }

  return null;
}

function optionalMxRecords(value: unknown): EmailSecurityMxRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const exchange = optionalString(item.exchange);
    const priority = optionalNumber(item.priority);

    if (!exchange || priority === null) {
      return [];
    }

    return [
      {
        exchange,
        priority,
      },
    ];
  });
}

function parseEmailSecuritySummary(value: unknown): EmailSecuritySummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const domain = optionalString(value.domain);

  if (!domain) {
    return null;
  }

  return {
    checkedAt: optionalString(value.checkedAt) ?? "",
    dkimErrorCount: optionalNumber(value.dkimErrorCount) ?? 0,
    dkimSelectorsFound: optionalStringArray(value.dkimSelectorsFound),
    dkimSelectorsTested: optionalStringArray(value.dkimSelectorsTested),
    dmarcError: optionalString(value.dmarcError),
    dmarcFound: optionalBoolean(value.dmarcFound) ?? false,
    dmarcPolicy: optionalString(value.dmarcPolicy),
    dmarcRecord: optionalString(value.dmarcRecord),
    domain,
    mxError: optionalString(value.mxError),
    mxFound: optionalBoolean(value.mxFound) ?? false,
    mxRecords: optionalMxRecords(value.mxRecords),
    spfAssessment: optionalString(value.spfAssessment) ?? "Not checked",
    spfError: optionalString(value.spfError),
    spfFound: optionalBoolean(value.spfFound) ?? false,
    spfRecord: optionalString(value.spfRecord),
  };
}

function parseSslSummary(value: unknown): SslTlsSummary | null {
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
    checkedAt: optionalString(value.checkedAt) ?? "",
    daysUntilExpiry: optionalNumber(value.daysUntilExpiry),
    expired: optionalBoolean(value.expired),
    hostnameMatched: optionalBoolean(value.hostnameMatched),
    httpRedirectFinalUrl: optionalString(value.httpRedirectFinalUrl),
    httpRedirectsToHttps: optionalBoolean(value.httpRedirectsToHttps),
    httpRedirectStatusCode: optionalNumber(value.httpRedirectStatusCode),
    httpsAvailable,
    httpsError: optionalString(value.httpsError),
    issuer: optionalString(value.issuer),
    subject: optionalString(value.subject),
    subjectAltNames: optionalStringArray(value.subjectAltNames),
    validFrom: optionalString(value.validFrom),
    validTo: optionalString(value.validTo),
  };
}

function isTechExposedPathStatus(value: unknown): value is TechExposedPathStatus {
  return (
    value === "Reachable" ||
    value === "Redirected" ||
    value === "Forbidden" ||
    value === "Inconclusive" ||
    value === "Not found" ||
    value === "Check failed"
  );
}

function parseTechExposedPathCheck(value: unknown): TechExposedPathCheck | null {
  if (!isRecord(value) || !isTechExposedPathStatus(value.status)) {
    return null;
  }

  const path = optionalString(value.path);
  const url = optionalString(value.url);
  const statusCode =
    value.statusCode === null ? null : optionalNumber(value.statusCode);

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
    statusCode,
    url,
  };
}

function parseTechDetectionSummary(value: unknown): TechDetectionSummaryFromLog | null {
  if (!isRecord(value)) {
    return null;
  }

  const exposedPathChecks = Array.isArray(value.exposedPathChecks)
    ? value.exposedPathChecks
        .map(parseTechExposedPathCheck)
        .filter((item): item is TechExposedPathCheck => item !== null)
    : [];

  return {
    checkedAt: optionalString(value.checkedAt) ?? "",
    exposedPathChecks,
    homepageFinalUrl: optionalString(value.homepageFinalUrl),
    homepageStatusCode:
      value.homepageStatusCode === null
        ? null
        : optionalNumber(value.homepageStatusCode),
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

function getLatestHeaderSummary(
  logs: Array<{ message: string; metadata: unknown }>,
) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];

    if (log.message !== "HTTP headers scanner completed" || !isRecord(log.metadata)) {
      continue;
    }

    const headerSummary = log.metadata.headerSummary;

    if (!Array.isArray(headerSummary)) {
      continue;
    }

    const parsedSummary = headerSummary
      .map(parseHeaderSummaryItem)
      .filter((item): item is HeaderSummaryFromLog => item !== null);

    if (parsedSummary.length > 0) {
      return parsedSummary;
    }
  }

  return null;
}

function getLatestEmailSecuritySummary(
  logs: Array<{ message: string; metadata: unknown }>,
) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];

    if (
      log.message !== "Email security scanner completed" ||
      !isRecord(log.metadata)
    ) {
      continue;
    }

    const emailSecuritySummary = parseEmailSecuritySummary(
      log.metadata.emailSecuritySummary,
    );

    if (emailSecuritySummary) {
      return emailSecuritySummary;
    }
  }

  return null;
}

function getLatestSslSummary(logs: Array<{ message: string; metadata: unknown }>) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];

    if (log.message !== "SSL/TLS scanner completed" || !isRecord(log.metadata)) {
      continue;
    }

    const sslSummary = parseSslSummary(log.metadata.sslSummary);

    if (sslSummary) {
      return sslSummary;
    }
  }

  return null;
}

function getLatestTechDetectionSummary(
  logs: Array<{ message: string; metadata: unknown }>,
) {
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];

    if (
      log.message !== "Tech detection scanner completed" ||
      !isRecord(log.metadata)
    ) {
      continue;
    }

    const techDetectionSummary = parseTechDetectionSummary(
      log.metadata.techDetectionSummary,
    );

    if (techDetectionSummary) {
      return techDetectionSummary;
    }
  }

  return null;
}

function findingMentionsHeader(
  finding: ScanFinding,
  headerName: HttpSecurityHeaderName,
) {
  const haystack = `${finding.title} ${finding.evidence ?? ""}`;

  return haystack.includes(headerName);
}

function inferHeaderStatus(
  scanStatus: string,
  normalizedUrl: string,
  headerName: HttpSecurityHeaderName,
  relatedFindings: ScanFinding[],
): HeaderCheckStatus {
  if (scanStatus !== "COMPLETED") {
    return "Not checked";
  }

  if (
    headerName === "Strict-Transport-Security" &&
    normalizedUrl.startsWith("http://") &&
    relatedFindings.length === 0
  ) {
    return "Not checked";
  }

  if (
    relatedFindings.some(
      (finding) =>
        finding.title.startsWith("Missing") ||
        (finding.evidence ?? "").includes("not present"),
    )
  ) {
    return "Missing";
  }

  if (relatedFindings.length > 0) {
    return "Weak";
  }

  return "Present";
}

function buildHeaderRows(
  scanStatus: string,
  normalizedUrl: string,
  findings: ScanFinding[],
  headerSummary: HeaderSummaryFromLog[] | null,
) {
  const summaryByHeader = new Map(
    headerSummary?.map((summary) => [summary.name, summary]) ?? [],
  );

  return HTTP_SECURITY_HEADER_NAMES.map((headerName) => {
    const relatedFindings = findings.filter((finding) =>
      findingMentionsHeader(finding, headerName),
    );
    const summary = summaryByHeader.get(headerName);

    return {
      findingTitles:
        relatedFindings.length > 0
          ? relatedFindings.map((finding) => finding.title)
          : summary?.findingTitles ?? [],
      name: headerName,
      note: summary?.note ?? null,
      status:
        summary?.status ??
        inferHeaderStatus(scanStatus, normalizedUrl, headerName, relatedFindings),
    };
  });
}

function formatMxRecords(records: EmailSecurityMxRecord[]) {
  if (records.length === 0) {
    return "-";
  }

  return records
    .map((record) => `${record.exchange} (priority ${record.priority})`)
    .join(", ");
}

function emailMxStatus(summary: EmailSecuritySummary | null): EmailSecurityStatus {
  if (!summary) {
    return "Not checked";
  }

  if (summary.mxError) {
    return "Failed";
  }

  return summary.mxFound ? "Present" : "Missing";
}

function emailSpfStatus(summary: EmailSecuritySummary | null): EmailSecurityStatus {
  if (!summary) {
    return "Not checked";
  }

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

function emailDmarcStatus(summary: EmailSecuritySummary | null): EmailSecurityStatus {
  if (!summary) {
    return "Not checked";
  }

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

function emailDkimStatus(summary: EmailSecuritySummary | null): EmailSecurityStatus {
  if (!summary) {
    return "Not checked";
  }

  if (summary.dkimSelectorsFound.length > 0) {
    return "Present";
  }

  return summary.dkimErrorCount > 0
    ? "Failed"
    : "Observation";
}

function emailRelatedFindingsStatus(
  summary: EmailSecuritySummary | null,
  relatedFindings: ScanFinding[],
): EmailSecurityStatus {
  if (!summary) {
    return "Not checked";
  }

  if (relatedFindings.length === 0) {
    return "Present";
  }

  if (relatedFindings.some((finding) => finding.severity === "CRITICAL")) {
    return "Critical";
  }

  if (relatedFindings.some((finding) => finding.severity === "HIGH")) {
    return "High";
  }

  if (relatedFindings.some((finding) => finding.severity === "MEDIUM")) {
    return "Attention";
  }

  if (relatedFindings.some((finding) => finding.severity === "LOW")) {
    return "Hardening";
  }

  return "Observation";
}

function buildEmailSecurityCards(
  summary: EmailSecuritySummary | null,
  relatedFindings: ScanFinding[],
): EmailSecurityCard[] {
  const mxStatus = emailMxStatus(summary);
  const spfStatus = emailSpfStatus(summary);
  const dmarcStatus = emailDmarcStatus(summary);
  const dkimStatus = emailDkimStatus(summary);
  const relatedFindingsStatus = emailRelatedFindingsStatus(
    summary,
    relatedFindings,
  );
  const relatedFindingText =
    relatedFindings.length > 0
      ? relatedFindings.map((finding) => finding.title).join(", ")
      : "-";

  return [
    {
      detail: summary?.domain ?? "-",
      label: "Domain checked",
      status: summary ? "Present" : "Not checked",
      wrap: "break-all",
    },
    {
      detail: summary
        ? summary.mxError ??
          (summary.mxFound ? formatMxRecords(summary.mxRecords) : "No MX records found.")
        : "-",
      label: "MX records status",
      status: mxStatus,
      wrap: "break-all",
    },
    {
      detail: summary?.spfError ?? summary?.spfAssessment ?? "-",
      label: "SPF status",
      status: spfStatus,
      wrap: "break-words",
    },
    {
      detail: summary?.spfRecord ?? "-",
      label: "SPF record",
      status: spfStatus,
      wrap: "break-all",
    },
    {
      detail: summary
        ? summary.dmarcError ??
          (summary.dmarcFound ? "DMARC record found." : "No DMARC record found.")
        : "-",
      label: "DMARC status",
      status: dmarcStatus,
      wrap: "break-words",
    },
    {
      detail: summary?.dmarcPolicy ?? "-",
      label: "DMARC policy",
      status: dmarcStatus,
      wrap: "break-words",
    },
    {
      detail: summary?.dmarcRecord ?? "-",
      label: "DMARC record",
      status: dmarcStatus,
      wrap: "break-all",
    },
    {
      detail: summary
        ? dkimStatus === "Present"
          ? "One or more common DKIM selectors were found."
          : summary.dkimErrorCount
            ? "One or more DKIM selector lookups could not be completed."
            : "No common DKIM selector matched. DKIM may still use a different selector."
        : "-",
      label: "DKIM common selector status",
      status: dkimStatus,
      wrap: "break-words",
    },
    {
      detail: summary?.dkimSelectorsTested.join(", ") ?? "-",
      label: "DKIM selectors tested",
      status: summary ? "Present" : "Not checked",
      wrap: "break-words",
    },
    {
      detail:
        summary && summary.dkimSelectorsFound.length > 0
          ? summary.dkimSelectorsFound.join(", ")
          : "-",
      label: "DKIM selectors found",
      status: dkimStatus,
      wrap: "break-words",
    },
    {
      detail: relatedFindingText,
      label: "Related findings",
      status: relatedFindingsStatus,
      wrap: "break-words",
    },
  ];
}

function formatSslDetailDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatDate(date);
}

function getCertificateStatus(summary: SslTlsSummary | null): SslStatus {
  if (!summary || !summary.httpsAvailable) {
    return "Not checked";
  }

  if (!summary.certificateExists) {
    return "Missing";
  }

  if (summary.expired) {
    return "Expired";
  }

  return summary.certificateValid ? "Valid" : "Warning";
}

function getExpiryStatus(summary: SslTlsSummary | null): SslStatus {
  if (!summary || summary.daysUntilExpiry === null) {
    return "Not checked";
  }

  if (summary.expired) {
    return "Expired";
  }

  if (summary.daysUntilExpiry <= 30) {
    return "Warning";
  }

  return "Valid";
}

function getSslFindingTitles(findings: ScanFinding[], patterns: string[]) {
  return findings
    .filter((finding) =>
      patterns.some((pattern) =>
        `${finding.title} ${finding.evidence ?? ""}`
          .toLowerCase()
          .includes(pattern.toLowerCase()),
      ),
    )
    .map((finding) => finding.title);
}

function buildSslRows(
  summary: SslTlsSummary | null,
  sslFindings: ScanFinding[],
): SslTlsRow[] {
  const httpsStatus = !summary
    ? "Not checked"
    : summary.httpsAvailable
      ? "Available"
      : "Missing";
  const redirectStatus = !summary
    ? "Not checked"
    : summary.httpRedirectsToHttps === true
      ? "Available"
      : summary.httpRedirectsToHttps === false
        ? "Missing"
        : "Not checked";
  const hostnameStatus = !summary
    ? "Not checked"
    : summary.hostnameMatched === true
      ? "Valid"
      : summary.hostnameMatched === false
        ? "Warning"
        : "Not checked";
  const expiryStatus = getExpiryStatus(summary);

  return [
    {
      detail: summary?.httpsError ?? (summary ? "HTTPS endpoint checked." : "-"),
      label: "HTTPS availability",
      relatedFindingTitles: getSslFindingTitles(sslFindings, ["HTTPS"]),
      status: httpsStatus,
    },
    {
      detail: summary?.httpRedirectFinalUrl
        ? `Final URL: ${summary.httpRedirectFinalUrl}`
        : "-",
      label: "HTTP to HTTPS redirect",
      relatedFindingTitles: getSslFindingTitles(sslFindings, ["HTTP does not redirect"]),
      status: redirectStatus,
    },
    {
      detail:
        summary?.authorizationError ??
        (summary?.certificateExists ? "Certificate was presented." : "-"),
      label: "Certificate status",
      relatedFindingTitles: getSslFindingTitles(sslFindings, [
        "certificate is expired",
        "certificate expires",
        "hostname mismatch",
      ]),
      status: getCertificateStatus(summary),
    },
    {
      detail: summary?.issuer ?? "-",
      label: "Certificate issuer",
      relatedFindingTitles: [],
      status: summary?.issuer ? "Valid" : "Not checked",
    },
    {
      detail: summary?.subject ?? "-",
      label: "Certificate subject/common name",
      relatedFindingTitles: [],
      status: summary?.subject ? "Valid" : "Not checked",
    },
    {
      detail: formatSslDetailDate(summary?.validFrom ?? null),
      label: "Valid from",
      relatedFindingTitles: [],
      status: summary?.validFrom ? "Valid" : "Not checked",
    },
    {
      detail: formatSslDetailDate(summary?.validTo ?? null),
      label: "Valid to",
      relatedFindingTitles: getSslFindingTitles(sslFindings, ["certificate expires"]),
      status: expiryStatus,
    },
    {
      detail:
        summary?.daysUntilExpiry === null || summary?.daysUntilExpiry === undefined
          ? "-"
          : `${summary.daysUntilExpiry} days`,
      label: "Days until expiry",
      relatedFindingTitles: getSslFindingTitles(sslFindings, ["certificate expires"]),
      status: expiryStatus,
    },
    {
      detail:
        summary?.subjectAltNames && summary.subjectAltNames.length > 0
          ? summary.subjectAltNames.join(", ")
          : "-",
      label: "Subject alternative names",
      relatedFindingTitles: [],
      status:
        summary?.subjectAltNames && summary.subjectAltNames.length > 0
          ? "Valid"
          : "Not checked",
    },
    {
      detail:
        summary?.hostnameMatched === true
          ? "Certificate covers the requested hostname."
          : summary?.hostnameMatched === false
            ? "Certificate subject does not match the requested hostname."
            : "-",
      label: "Hostname match",
      relatedFindingTitles: getSslFindingTitles(sslFindings, ["hostname mismatch"]),
      status: hostnameStatus,
    },
  ];
}

function formatList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "-";
}

function getTechRelatedFindingText(relatedFindings: ScanFinding[]) {
  return relatedFindings.length > 0
    ? relatedFindings.map((finding) => finding.title).join(", ")
    : "-";
}

function hasServerVersionFinding(relatedFindings: ScanFinding[]) {
  return relatedFindings.some(
    (finding) => finding.title === "Server version exposed in response header",
  );
}

function buildTechDetectionCards(
  summary: TechDetectionSummaryFromLog | null,
  relatedFindings: ScanFinding[],
): TechDetectionCard[] {
  const serverVersionExposed = hasServerVersionFinding(relatedFindings);

  return [
    {
      detail: summary ? formatList(summary.technologiesDetected) : "-",
      label: "Technologies detected",
      status: !summary
        ? "Not checked"
        : summary.technologiesDetected.length > 0
          ? "Observed"
          : "Not observed",
      wrap: "break-words",
    },
    {
      detail: summary
        ? summary.wordpressDetected
          ? "WordPress indicators detected."
          : "No WordPress indicators were observed during the safe checks."
        : "-",
      label: "WordPress status",
      status: !summary
        ? "Not checked"
        : summary.wordpressDetected
          ? "Detected"
          : "Not detected",
      wrap: "break-words",
    },
    {
      detail: summary ? formatList(summary.wordpressEvidence) : "-",
      label: "WordPress evidence",
      status: !summary
        ? "Not checked"
        : summary.wordpressEvidence.length > 0
          ? "Observed"
          : "Not observed",
      wrap: "break-words",
    },
    {
      detail: summary
        ? summary.woocommerceDetected
          ? "WooCommerce indicators detected."
          : "No WooCommerce indicators were observed on the homepage."
        : "-",
      label: "WooCommerce status",
      status: !summary
        ? "Not checked"
        : summary.woocommerceDetected
          ? "Detected"
          : "Not detected",
      wrap: "break-words",
    },
    {
      detail: summary ? formatList(summary.woocommerceEvidence) : "-",
      label: "WooCommerce evidence",
      status: !summary
        ? "Not checked"
        : summary.woocommerceEvidence.length > 0
          ? "Observed"
          : "Not observed",
      wrap: "break-words",
    },
    {
      detail: summary
        ? summary.xmlRpcEvidence ??
          "No XML-RPC accessibility indicators were observed."
        : "-",
      label: "XML-RPC status",
      status: !summary
        ? "Not checked"
        : summary.xmlRpcAccessible
          ? "Accessible"
          : "Not accessible",
      wrap: "break-words",
    },
    {
      detail: summary?.serverHeader ?? "-",
      label: "Server header",
      status: !summary
        ? "Not checked"
        : serverVersionExposed
          ? "Version exposed"
          : summary.serverHeader
            ? "Observed"
            : "Not observed",
      wrap: "break-all",
    },
    {
      detail: summary?.homepageStatusCode
        ? `Homepage responded with HTTP ${summary.homepageStatusCode}.`
        : "-",
      label: "Homepage fetch",
      status: !summary
        ? "Not checked"
        : summary.homepageStatusCode
          ? "Observed"
          : "Not observed",
      wrap: "break-words",
    },
    {
      detail: getTechRelatedFindingText(relatedFindings),
      label: "Related findings",
      status: !summary
        ? "Not checked"
        : relatedFindings.length > 0
          ? "Observed"
          : "Not observed",
      wrap: "break-words",
    },
  ];
}

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const prisma = getPrisma();
  const scan = await prisma.scan.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      client: {
        select: {
          companyName: true,
          id: true,
          name: true,
        },
      },
      findings: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          title: true,
          severity: true,
          category: true,
          owaspMapping: true,
          evidence: true,
          impact: true,
          fix: true,
          confidence: true,
          createdAt: true,
        },
      },
      logs: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          level: true,
          message: true,
          metadata: true,
          createdAt: true,
        },
      },
      reports: {
        orderBy: {
          generatedAt: "desc",
        },
        select: {
          id: true,
          pdfUrl: true,
          reportType: true,
          status: true,
        },
      },
    },
  });

  if (!scan) {
    notFound();
  }
  const scanType = scan.scanType === "BASIC" ? "BASIC" : "PROFESSIONAL";
  const isBasicScan = scanType === "BASIC";

  const findings = [...scan.findings].sort(
    (first, second) =>
      severityOrder.indexOf(first.severity) - severityOrder.indexOf(second.severity) ||
      first.createdAt.getTime() - second.createdAt.getTime(),
  );
  const severityCounts = severityOrder.reduce<Record<FindingSeverity, number>>(
    (counts, severity) => {
      counts[severity] = findings.filter((finding) => finding.severity === severity).length;
      return counts;
    },
    {
      CRITICAL: 0,
      HIGH: 0,
      INFO: 0,
      LOW: 0,
      MEDIUM: 0,
    },
  );
  const headerRows = buildHeaderRows(
    scan.status,
    scan.normalizedUrl,
    findings,
    getLatestHeaderSummary(scan.logs),
  );
  const emailFindings = findings.filter(
    (finding) => finding.category === EMAIL_SECURITY_CATEGORY,
  );
  const emailSecurityCards = buildEmailSecurityCards(
    getLatestEmailSecuritySummary(scan.logs),
    emailFindings,
  );
  const sslFindings = findings.filter(
    (finding) => finding.category === SSL_TLS_CATEGORY,
  );
  const sslRows = buildSslRows(getLatestSslSummary(scan.logs), sslFindings);
  const techFindings = findings.filter(
    (finding) => finding.category === TECH_DETECTION_CATEGORY,
  );
  const techDetectionSummary = getLatestTechDetectionSummary(scan.logs);
  const techDetectionCards = buildTechDetectionCards(
    techDetectionSummary,
    techFindings,
  );
  const techExposedPathChecks = techDetectionSummary?.exposedPathChecks ?? [];
  const owaspChecklistSummary = getLatestOwaspChecklistSummary(scan.logs);
  const owaspChecklistItems = owaspChecklistSummary?.checklistItems ?? [];
  const remediationSummary = owaspChecklistSummary?.remediationSummary ?? null;
  const calculatedScore = calculateRiskScore(findings);
  const displayedScore =
    scan.score ?? (scan.status === "COMPLETED" ? calculatedScore : null);
  const displayedGrade =
    (isGrade(scan.grade) ? scan.grade : null) ??
    (displayedScore !== null ? calculateGrade(displayedScore) : null);
  const scoreExplanation =
    displayedScore !== null && displayedGrade !== null
      ? buildScoreExplanation(findings, displayedScore, displayedGrade)
      : null;
  const categoryScores = calculateCategoryScores(findings);
  const basicRecommendations = buildPriorityFixList(findings).slice(0, 8);
  const details = [
    ["Scan type", scanType],
    ["Target URL", scan.targetUrl],
    ["Normalized URL", scan.normalizedUrl],
    ["Root domain", scan.rootDomain],
    [
      "Client",
      scan.client
        ? scan.client.companyName
          ? `${scan.client.name} (${scan.client.companyName})`
          : scan.client.name
        : scan.clientName ?? "Not assigned",
    ],
    ["Status", scan.status],
    ["Score", displayedScore !== null ? `${displayedScore}/100` : "Pending"],
    ["Grade", displayedGrade ?? "Pending"],
    ["Created", formatDate(scan.createdAt)],
    ["Started at", formatDate(scan.startedAt)],
    ["Completed at", formatDate(scan.completedAt)],
  ];
  const shouldAutoRefresh = scan.status === "PENDING" || scan.status === "RUNNING";
  const generatedReport = scan.reports.find(
    (report) => report.status === "GENERATED" && report.pdfUrl,
  );
  const [credits, hasClientAccess, clients] = await Promise.all([
    getUserCredits(user.id),
    canManageClients(user.id),
    prisma.client.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        companyName: true,
        id: true,
        name: true,
      },
    }),
  ]);
  const reportDownloadUrl = generatedReport
    ? `/api/reports/${generatedReport.id}/download`
    : null;

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Scan details"
        title={scan.rootDomain}
        description={
          isBasicScan
            ? "Basic scan results with core automated checks and recommendations."
            : "HTTP header, SSL/TLS, email security, and technology findings for this scan."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{scanType}</Badge>
            <Badge variant={statusVariant(scan.status)}>{scan.status}</Badge>
            <ScanAutoRefresh enabled={shouldAutoRefresh} />
          </div>
        }
      />

      {scan.errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <div>
            <AlertTitle>Scan failed</AlertTitle>
            <AlertDescription>{scan.errorMessage}</AlertDescription>
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>PDF report</CardTitle>
              <CardDescription>
                {isBasicScan
                  ? "Generate a basic PDF report from completed core scan results."
                  : "Generate a professional PDF from saved completed scan data."}
              </CardDescription>
            </div>
            {generatedReport?.reportType === "WHITE_LABEL" ? (
              <Badge variant="success">Branded</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <ReportActions
            downloadUrl={reportDownloadUrl}
            generateUrl={`/api/scans/${scan.id}/generate-report`}
            generateLabel={isBasicScan ? "Generate Basic PDF Report" : "Generate PDF Report"}
            generatingLabel={isBasicScan ? "Generating Basic PDF..." : "Generating..."}
            hasCredits={credits.creditsRemaining > 0}
            isCompleted={scan.status === "COMPLETED"}
            noCreditsMessage="No report credits available."
          />
        </CardContent>
      </Card>

      {hasClientAccess && !isBasicScan ? (
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
            <CardDescription>
              Attach this scan and its generated report to one of your clients.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="min-w-0 rounded-md border border-border bg-background p-4">
              <p className="text-sm font-medium text-muted-foreground">
                Current client
              </p>
              <p className="mt-1 break-words text-sm font-semibold text-foreground">
                {scan.client
                  ? scan.client.companyName
                    ? `${scan.client.name} - ${scan.client.companyName}`
                    : scan.client.name
                  : scan.clientName ?? "Not assigned"}
              </p>
            </div>
            <ScanClientAssignment
              clients={clients}
              currentClientId={scan.clientId}
              scanId={scan.id}
            />
          </CardContent>
        </Card>
      ) : null}

      {isBasicScan ? (
        <Alert>
          <ShieldCheck className="size-4" aria-hidden="true" />
          <div>
            <AlertTitle>Upgrade for full professional workflow</AlertTitle>
            <AlertDescription>
              Need OWASP checklist, professional PDF, branding, and share links? Use Professional Scan.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <Globe className="mt-1 size-5 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Target</p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {scan.normalizedUrl}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <ListChecks
              className="mt-1 size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Findings</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {findings.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <Timer className="mt-1 size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{scan.status}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <CalendarDays
              className="mt-1 size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatDate(scan.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            Finding totals from completed scanner modules for this scan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Score
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {displayedScore !== null ? `${displayedScore}/100` : "Pending"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Grade
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {displayedGrade ?? "Pending"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Total findings
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {findings.length}
            </p>
          </div>
          {severityOrder.map((severity) => (
            <div
              key={severity}
              className="rounded-md border border-border bg-background p-4"
            >
              <p className="text-sm font-medium text-muted-foreground">
                {severity[0] + severity.slice(1).toLowerCase()}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {severityCounts[severity]}
              </p>
            </div>
          ))}
          <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4 xl:col-span-8">
            Score is based on automated findings from completed scanner modules.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automated posture score</CardTitle>
          <CardDescription>
            Based on findings from completed scanner modules. This is not a
            penetration test score. This is not OWASP compliance certification.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scoreExplanation ? (
            <>
              {([
                ["Score", `${scoreExplanation.score}/100`],
                ["Grade", scoreExplanation.grade],
                ["Penalty summary", scoreExplanation.penaltySummary],
                [
                  "Highest severity found",
                  scoreExplanation.highestSeverityFound === "NONE"
                    ? "None"
                    : scoreExplanation.highestSeverityFound,
                ],
                ["Scored findings", String(scoreExplanation.findingsCounted)],
                [
                  "Note",
                  "Info observations are shown in findings but do not reduce the score.",
                ],
              ] as const).map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-md border border-border bg-background p-4"
                >
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className="mt-1 break-words text-sm font-semibold leading-6 text-foreground">
                    {value}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              Risk scoring is pending for this scan.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category scores</CardTitle>
          <CardDescription>
            Category-level scoring uses real findings from completed automated
            scanner modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 xl:grid-cols-2">
          {categoryScores.map((categoryScore) => (
            <article
              key={categoryScore.category}
              className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                  {categoryScore.category}
                </h3>
                <Badge variant="outline" className="w-fit shrink-0">
                  Grade {categoryScore.grade}
                </Badge>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["Score", `${categoryScore.score}/100`],
                  ["Finding count", String(categoryScore.findingCount)],
                  [
                    "Severity breakdown",
                    severityOrder
                      .map(
                        (severity) =>
                          `${severity}: ${categoryScore.severityCounts[severity]}`,
                      )
                      .join(", "),
                  ],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 min-w-0 break-words text-sm leading-6 text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="min-w-0 break-words text-sm leading-6 text-muted-foreground">
                {categoryScore.explanation}
              </p>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scan record</CardTitle>
          <CardDescription>
            This shell shows the scan metadata created during submission.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {details.map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-md border border-border bg-background p-4"
            >
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {value}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status lifecycle</CardTitle>
          <CardDescription>
            The worker moves queued scans through these states.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="flex min-w-0 flex-wrap gap-2">
            {lifecycleStatuses.map((status) => (
              <Badge
                key={status}
                variant={status === scan.status ? statusVariant(status) : "outline"}
              >
                {status}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>
            Real findings saved by completed scanner modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No findings have been saved for this scan yet.
            </p>
          ) : (
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              {findings.map((finding) => (
                <article
                  key={finding.id}
                  className="grid min-w-0 gap-4 rounded-md border border-border bg-background p-4 sm:p-5"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-6 text-foreground">
                        {finding.title}
                      </h3>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="max-w-full whitespace-normal break-words leading-tight"
                        >
                          {finding.category}
                        </Badge>
                      </div>
                    </div>
                    <Badge
                      variant={severityVariant(finding.severity)}
                      className="w-fit shrink-0"
                    >
                      {finding.severity}
                    </Badge>
                  </div>

                  <dl className="grid min-w-0 gap-3 md:grid-cols-2">
                    {([
                      ["Evidence", finding.evidence, true],
                      ["Impact", finding.impact, true],
                      ["Fix", finding.fix, true],
                      ["Confidence", finding.confidence, false],
                      ["OWASP mapping", finding.owaspMapping, false],
                    ] as const).map(([label, value, fullWidth]) => (
                      <div
                        key={label}
                        className={fullWidth ? "min-w-0 md:col-span-2" : "min-w-0"}
                      >
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 min-w-0 whitespace-normal break-words text-sm leading-6 text-foreground">
                          {value ?? "-"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isBasicScan ? (
        <Card>
          <CardHeader>
            <CardTitle>Basic recommendations</CardTitle>
            <CardDescription>
              Practical recommendations generated from saved findings in this Basic Scan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-3">
            {basicRecommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No basic recommendations are available yet.
              </p>
            ) : (
              basicRecommendations.map((item, index) => (
                <article
                  key={`${item.title}-${index}`}
                  className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-4"
                >
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                      {item.title}
                    </h3>
                    <Badge variant={severityVariant(item.severity)} className="w-fit shrink-0">
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.category}</p>
                  <p className="text-sm leading-6 text-foreground">{item.recommendation}</p>
                </article>
              ))
            )}
            <p className="text-sm text-muted-foreground">
              OWASP checklist is available in Professional Scan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>OWASP Checklist</CardTitle>
              <CardDescription>
                OWASP-aligned posture checklist based only on completed automated
                checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {owaspChecklistItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  OWASP checklist results have not been generated for this scan yet.
                </p>
              ) : (
                <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                  {owaspChecklistItems.map((item) => (
                    <article
                      key={item.categoryName}
                      className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                    >
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                          {item.categoryName}
                        </h3>
                        <Badge
                          variant={owaspStatusVariant(item.status)}
                          className="w-fit max-w-full shrink-0 whitespace-normal break-words leading-tight"
                        >
                          {item.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <dl className="grid min-w-0 gap-3">
                        {([
                          ["Severity summary", item.severitySummary],
                          ["Evidence summary", item.evidenceSummary],
                          [
                            "Related findings count",
                            String(item.relatedFindings.length),
                          ],
                          ["Recommendation", item.recommendation],
                          ["Limitation note", item.limitationNote],
                        ] as const).map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-xs font-semibold uppercase text-muted-foreground">
                              {label}
                            </dt>
                            <dd className="mt-1 min-w-0 whitespace-normal break-words text-sm leading-6 text-foreground">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Priority remediation summary</CardTitle>
              <CardDescription>
                Recommendations grouped from real findings and manual-review
                limitations.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-4 xl:grid-cols-2">
              {remediationSummary ? (
                remediationGroups.map((group) => {
                  const items = remediationSummary[group.key];

                  return (
                    <section
                      key={group.key}
                      className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                    >
                      <h3 className="text-sm font-semibold text-foreground">
                        {group.title}
                      </h3>
                      {items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {group.emptyText}
                        </p>
                      ) : (
                        <div className="grid min-w-0 gap-3">
                          {items.map((item, index) => (
                            <article
                              key={`${group.key}-${item.title}-${index}`}
                              className="grid min-w-0 gap-2 rounded-md border border-border p-3"
                            >
                              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <h4 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                                  {item.title}
                                </h4>
                                <Badge
                                  variant={severityVariant(item.severity)}
                                  className="w-fit shrink-0"
                                >
                                  {item.severity}
                                </Badge>
                              </div>
                              <p className="min-w-0 break-words text-sm text-muted-foreground">
                                {item.category}
                              </p>
                              <p className="min-w-0 whitespace-normal break-words text-sm leading-6 text-foreground">
                                {item.recommendation}
                              </p>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground xl:col-span-2">
                  Priority remediation summary has not been generated for this scan
                  yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>HTTP security headers</CardTitle>
          <CardDescription>
            Checked homepage response headers and related findings.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            {headerRows.map((header) => (
              <article
                key={header.name}
                className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                    {header.name}
                  </h3>
                  <Badge
                    variant={headerStatusVariant(header.status)}
                    className="w-fit shrink-0"
                  >
                    {header.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Related finding
                  </p>
                  <p className="mt-1 min-w-0 whitespace-normal break-words text-sm leading-6 text-foreground">
                    {header.findingTitles.length > 0
                      ? header.findingTitles.join(", ")
                      : header.note ?? "-"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SSL/TLS</CardTitle>
          <CardDescription>
            HTTPS availability, redirect behavior, and certificate status.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            {sslRows.map((row) => (
              <article
                key={row.label}
                className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                    {row.label}
                  </h3>
                  <Badge
                    variant={sslStatusVariant(row.status)}
                    className="w-fit shrink-0"
                  >
                    {row.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Details
                  </p>
                  <p className="mt-1 min-w-0 whitespace-normal break-all text-sm leading-6 text-foreground">
                    {row.detail}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Related finding
                  </p>
                  <p className="mt-1 min-w-0 whitespace-normal break-words text-sm leading-6 text-foreground">
                    {row.relatedFindingTitles.length > 0
                      ? row.relatedFindingTitles.join(", ")
                      : "-"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Security</CardTitle>
          <CardDescription>
            MX, SPF, DMARC, and common DKIM selector checks for the root domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {emailSecurityCards.map((item) => (
              <article
                key={item.label}
                className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                    {item.label}
                  </h3>
                  <Badge
                    variant={emailSecurityStatusVariant(item.status)}
                    className="w-fit max-w-full shrink-0 whitespace-normal break-words leading-tight"
                  >
                    {item.status}
                  </Badge>
                </div>
                <p
                  className={`min-w-0 whitespace-normal text-sm leading-6 text-foreground ${
                    item.wrap === "break-all" ? "break-all" : "break-words"
                  }`}
                >
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tech Detection</CardTitle>
          <CardDescription>
            Safe homepage, WordPress, XML-RPC, server header, and limited public
            path observations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {techDetectionCards.map((item) => (
              <article
                key={item.label}
                className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 break-words text-sm font-semibold leading-6 text-foreground">
                    {item.label}
                  </h3>
                  <Badge
                    variant={techDetectionStatusVariant(item.status)}
                    className="w-fit max-w-full shrink-0 whitespace-normal break-words leading-tight"
                  >
                    {item.status}
                  </Badge>
                </div>
                <p
                  className={`min-w-0 whitespace-normal text-sm leading-6 text-foreground ${
                    item.wrap === "break-all" ? "break-all" : "break-words"
                  }`}
                >
                  {item.detail}
                </p>
              </article>
            ))}
          </div>

          <div className="grid min-w-0 gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Public path observations
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Fixed safe checks only; no crawling, login attempts, or form
                submission.
              </p>
            </div>
            {techExposedPathChecks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No public path observations have been saved yet.
              </p>
            ) : (
              <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {techExposedPathChecks.map((check) => (
                  <article
                    key={check.path}
                    className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                  >
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h4 className="min-w-0 break-all text-sm font-semibold leading-6 text-foreground">
                        {check.path}
                      </h4>
                      <Badge
                        variant={exposedPathStatusVariant(check.status)}
                        className="w-fit shrink-0"
                      >
                        {check.status}
                      </Badge>
                    </div>
                    <dl className="grid min-w-0 gap-3">
                      {([
                        [
                          "Status",
                          check.statusCode === null
                            ? check.error ?? "-"
                            : `HTTP ${check.statusCode}`,
                        ],
                        ["Evidence", check.evidence ?? check.error ?? "-"],
                        ["Related finding", check.findingTitle ?? "-"],
                        ["URL", check.url],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="mt-1 min-w-0 whitespace-normal break-all text-sm leading-6 text-foreground">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result sections</CardTitle>
          <CardDescription>
            {isBasicScan
              ? "Basic Scan includes core technical checks, score/grade, and basic recommendations."
              : "HTTP Security Headers, SSL/TLS, Email Security, Tech Detection, OWASP Checklist, and Risk Scoring now use real results. PDF reports are a future phase."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">HTTP Security Headers</Badge>
            <Badge variant="success">SSL/TLS</Badge>
            <Badge variant="success">Email Security</Badge>
            <Badge variant="success">Tech Detection</Badge>
            {!isBasicScan ? <Badge variant="success">OWASP Checklist</Badge> : null}
            <Badge variant="success">Risk Scoring</Badge>
            {!isBasicScan ? <Badge variant="success">PDF Reports</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scan logs</CardTitle>
          <CardDescription>
            Worker lifecycle events and queue errors for this scan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scan.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scan logs yet.</p>
          ) : (
            <div className="grid min-w-0 gap-3">
              {scan.logs.map((log) => (
                <div
                  key={log.id}
                  className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <Badge variant={logLevelVariant(log.level)}>{log.level}</Badge>
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">
                    {log.message}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
