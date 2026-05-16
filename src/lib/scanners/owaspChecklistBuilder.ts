export const OWASP_CHECKLIST_LOG_METADATA_KEY = "owaspChecklistSummary";

export const owaspChecklistCategories = [
  "Broken Access Control",
  "Cryptographic Failures",
  "Injection",
  "Insecure Design",
  "Security Misconfiguration",
  "Vulnerable and Outdated Components",
  "Identification and Authentication Failures",
  "Software and Data Integrity Failures",
  "Security Logging and Monitoring Failures",
  "Server-Side Request Forgery",
] as const;

export type OwaspChecklistCategoryName =
  (typeof owaspChecklistCategories)[number];

export type OwaspChecklistStatus =
  | "PASSED"
  | "ATTENTION_REQUIRED"
  | "OBSERVATION"
  | "NOT_CHECKED";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type OwaspChecklistFinding = {
  id?: string;
  scanId: string;
  title: string;
  severity: FindingSeverity;
  category: string;
  owaspMapping?: string | null;
  evidence?: string | null;
  impact?: string | null;
  fix?: string | null;
  confidence?: string | null;
};

export type OwaspChecklistRelatedFinding = {
  id?: string;
  title: string;
  severity: FindingSeverity;
  category: string;
  evidence: string | null;
  fix: string | null;
};

export type OwaspChecklistItem = {
  categoryName: OwaspChecklistCategoryName;
  status: OwaspChecklistStatus;
  severitySummary: string;
  evidenceSummary: string;
  relatedFindings: OwaspChecklistRelatedFinding[];
  recommendation: string;
  limitationNote: string;
};

export type RemediationPriority =
  | "immediateAttention"
  | "recommendedHardening"
  | "informationalObservations"
  | "manualReview";

export type RemediationSummaryItem = {
  title: string;
  severity: FindingSeverity;
  category: string;
  recommendation: string;
};

export type RemediationSummary = Record<
  RemediationPriority,
  RemediationSummaryItem[]
>;

export type CompletedScannerModules = {
  httpHeaders?: boolean;
  sslTls?: boolean;
  emailSecurity?: boolean;
  techDetection?: boolean;
};

export type BuildOwaspChecklistInput = {
  scanId: string;
  findings: OwaspChecklistFinding[];
  completedModules?: CompletedScannerModules;
};

export type BuildOwaspChecklistOutput = {
  checklistItems: OwaspChecklistItem[];
  remediationSummary: RemediationSummary;
  logs: Array<{
    level: "INFO";
    message: string;
    metadata?: Record<string, unknown>;
  }>;
};

const severityRank: Record<FindingSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

function includesAny(value: string, tokens: string[]) {
  const normalized = value.toLowerCase();

  return tokens.some((token) => normalized.includes(token.toLowerCase()));
}

function toRelatedFinding(
  finding: OwaspChecklistFinding,
): OwaspChecklistRelatedFinding {
  return {
    category: finding.category,
    evidence: finding.evidence ?? null,
    fix: finding.fix ?? null,
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
  };
}

function sortFindings(findings: OwaspChecklistFinding[]) {
  return [...findings].sort(
    (first, second) =>
      severityRank[first.severity] - severityRank[second.severity] ||
      first.title.localeCompare(second.title),
  );
}

function summarizeSeverity(findings: OwaspChecklistFinding[]) {
  if (findings.length === 0) {
    return "No related findings.";
  }

  const counts = findings.reduce<Partial<Record<FindingSeverity, number>>>(
    (summary, finding) => {
      summary[finding.severity] = (summary[finding.severity] ?? 0) + 1;
      return summary;
    },
    {},
  );

  return (Object.keys(severityRank) as FindingSeverity[])
    .filter((severity) => counts[severity])
    .map((severity) => `${counts[severity]} ${severity.toLowerCase()}`)
    .join(", ");
}

function summarizeEvidence(
  findings: OwaspChecklistFinding[],
  fallback: string,
) {
  if (findings.length === 0) {
    return fallback;
  }

  return sortFindings(findings)
    .slice(0, 3)
    .map((finding) => finding.title)
    .join("; ");
}

function fixedItem(input: {
  categoryName: OwaspChecklistCategoryName;
  recommendation: string;
  limitationNote: string;
  evidenceSummary: string;
}): OwaspChecklistItem {
  return {
    categoryName: input.categoryName,
    evidenceSummary: input.evidenceSummary,
    limitationNote: input.limitationNote,
    recommendation: input.recommendation,
    relatedFindings: [],
    severitySummary: "Not checked by current scanner.",
    status: "NOT_CHECKED",
  };
}

function attentionOrPassedItem(input: {
  categoryName: OwaspChecklistCategoryName;
  findings: OwaspChecklistFinding[];
  completed: boolean;
  notCheckedEvidence: string;
  noIssueEvidence: string;
  recommendation: string;
  limitationNote: string;
}): OwaspChecklistItem {
  if (!input.completed) {
    return {
      categoryName: input.categoryName,
      evidenceSummary: input.notCheckedEvidence,
      limitationNote: input.limitationNote,
      recommendation: input.recommendation,
      relatedFindings: [],
      severitySummary: "Not checked by current scanner.",
      status: "NOT_CHECKED",
    };
  }

  const sortedFindings = sortFindings(input.findings);

  return {
    categoryName: input.categoryName,
    evidenceSummary: summarizeEvidence(sortedFindings, input.noIssueEvidence),
    limitationNote: input.limitationNote,
    recommendation: input.recommendation,
    relatedFindings: sortedFindings.map(toRelatedFinding),
    severitySummary: summarizeSeverity(sortedFindings),
    status: sortedFindings.length > 0 ? "ATTENTION_REQUIRED" : "PASSED",
  };
}

function isCryptographicFinding(finding: OwaspChecklistFinding) {
  const haystack = `${finding.category} ${finding.owaspMapping ?? ""} ${finding.title}`;

  return includesAny(haystack, [
    "SSL/TLS",
    "Cryptographic Failures",
    "Strict-Transport-Security",
    "HTTPS",
    "certificate",
    "HSTS",
  ]);
}

function isSecurityMisconfigurationFinding(finding: OwaspChecklistFinding) {
  const haystack = `${finding.category} ${finding.owaspMapping ?? ""} ${finding.title}`;

  return includesAny(haystack, [
    "HTTP Security Headers",
    "Technology Detection",
    "Security Misconfiguration",
    "server header",
    "Server version exposed",
    "XML-RPC",
    "publicly reachable",
    "appears accessible",
    "exposed",
  ]);
}

function isVersionDisclosureFinding(finding: OwaspChecklistFinding) {
  const haystack = `${finding.category} ${finding.title} ${finding.evidence ?? ""}`;

  return includesAny(haystack, [
    "version exposed",
    "version disclosure",
    "WordPress version",
    "Server version exposed",
    "X-Powered-By",
    "Apache/",
    "Nginx/",
    "PHP/",
  ]);
}

function isEmailAuthAttentionFinding(finding: OwaspChecklistFinding) {
  const haystack = `${finding.category} ${finding.title}`;

  return (
    finding.category === "Email Security" &&
    includesAny(haystack, [
      "Missing MX",
      "Missing SPF",
      "Multiple SPF",
      "SPF record allows",
      "Missing DMARC",
    ])
  );
}

function isDkimObservation(finding: OwaspChecklistFinding) {
  const haystack = `${finding.category} ${finding.title} ${finding.evidence ?? ""}`;

  return (
    finding.category === "Email Security" &&
    includesAny(haystack, ["DKIM", "common selectors"]) &&
    finding.severity === "INFO"
  );
}

function buildVulnerableComponentsItem(
  completedModules: CompletedScannerModules,
  findings: OwaspChecklistFinding[],
) {
  const related = sortFindings(findings.filter(isVersionDisclosureFinding));
  const completed =
    completedModules.techDetection === true || completedModules.httpHeaders === true;

  if (!completed) {
    return {
      categoryName: "Vulnerable and Outdated Components",
      evidenceSummary:
        "Technology and version exposure checks have not completed for this scan.",
      limitationNote:
        "Automated checks do not verify patch levels or dependency inventories.",
      recommendation:
        "Review application, CMS, plugin, server, and dependency versions manually.",
      relatedFindings: [],
      severitySummary: "Not checked by current scanner.",
      status: "NOT_CHECKED",
    } satisfies OwaspChecklistItem;
  }

  return {
    categoryName: "Vulnerable and Outdated Components",
    evidenceSummary: summarizeEvidence(
      related,
      "No version disclosure or outdated component evidence detected by automated checks.",
    ),
    limitationNote:
      "No issue detected by this automated check does not prove components are fully updated.",
    recommendation:
      "Maintain an inventory of CMS, plugin, framework, server, and package versions, then patch against vendor advisories.",
    relatedFindings: related.map(toRelatedFinding),
    severitySummary: summarizeSeverity(related),
    status: related.length > 0 ? "ATTENTION_REQUIRED" : "OBSERVATION",
  } satisfies OwaspChecklistItem;
}

function buildIdentificationAuthItem(
  completedModules: CompletedScannerModules,
  findings: OwaspChecklistFinding[],
) {
  if (!completedModules.emailSecurity) {
    return {
      categoryName: "Identification and Authentication Failures",
      evidenceSummary: "Email authentication checks have not completed for this scan.",
      limitationNote:
        "The current scanner does not test actual login security, password policy, MFA, sessions, or account recovery.",
      recommendation:
        "Review application authentication controls manually and fix email authentication findings when present.",
      relatedFindings: [],
      severitySummary: "Not checked by current scanner.",
      status: "NOT_CHECKED",
    } satisfies OwaspChecklistItem;
  }

  const attentionFindings = findings.filter(isEmailAuthAttentionFinding);
  const dkimFindings = findings.filter(isDkimObservation);
  const related = sortFindings([...attentionFindings, ...dkimFindings]);

  return {
    categoryName: "Identification and Authentication Failures",
    evidenceSummary: summarizeEvidence(
      related,
      "No SPF, DMARC, or MX issue detected by automated email checks.",
    ),
    limitationNote:
      "Public login/admin observations are not direct authentication failures. Actual login security requires manual validation.",
    recommendation:
      "Fix SPF, DMARC, and MX issues. Treat common-selector DKIM results as low-confidence observations unless confirmed with the mail provider.",
    relatedFindings: related.map(toRelatedFinding),
    severitySummary: summarizeSeverity(related),
    status:
      attentionFindings.length > 0
        ? "ATTENTION_REQUIRED"
        : dkimFindings.length > 0
          ? "OBSERVATION"
          : "PASSED",
  } satisfies OwaspChecklistItem;
}

function createEmptyRemediationSummary(): RemediationSummary {
  return {
    immediateAttention: [],
    informationalObservations: [],
    manualReview: [],
    recommendedHardening: [],
  };
}

function buildRemediationSummary(
  findings: OwaspChecklistFinding[],
  manualItems: OwaspChecklistItem[],
) {
  const summary = createEmptyRemediationSummary();

  for (const finding of sortFindings(findings)) {
    const item = {
      category: finding.category,
      recommendation: finding.fix ?? "Review this finding and define a remediation.",
      severity: finding.severity,
      title: finding.title,
    };

    if (
      finding.severity === "CRITICAL" ||
      finding.severity === "HIGH" ||
      finding.severity === "MEDIUM"
    ) {
      summary.immediateAttention.push(item);
    } else if (finding.severity === "LOW") {
      summary.recommendedHardening.push(item);
    } else {
      summary.informationalObservations.push(item);
    }
  }

  for (const item of manualItems) {
    summary.manualReview.push({
      category: item.categoryName,
      recommendation: item.recommendation,
      severity: "INFO",
      title: item.categoryName,
    });
  }

  return summary;
}

export function buildOwaspChecklist(
  input: BuildOwaspChecklistInput,
): BuildOwaspChecklistOutput {
  const completedModules = input.completedModules ?? {};
  const findings = input.findings.filter((finding) => finding.scanId === input.scanId);
  const cryptoFindings = findings.filter(isCryptographicFinding);
  const misconfigurationFindings = findings.filter(
    isSecurityMisconfigurationFinding,
  );

  const checklistItems: OwaspChecklistItem[] = [
    fixedItem({
      categoryName: "Broken Access Control",
      evidenceSummary:
        "Current scanner does not test authorization or access control flows.",
      limitationNote:
        "Do not interpret this as a pass. This category requires targeted application testing.",
      recommendation:
        "Perform manual authorization review and role-based access control testing.",
    }),
    attentionOrPassedItem({
      categoryName: "Cryptographic Failures",
      completed: completedModules.sslTls === true,
      findings: cryptoFindings,
      limitationNote:
        "This is limited to SSL/TLS, HTTPS redirect, certificate, and HSTS evidence from completed automated checks.",
      noIssueEvidence:
        "No issue detected by this automated SSL/TLS and transport security check.",
      notCheckedEvidence: "SSL/TLS scanner did not complete for this scan.",
      recommendation:
        "Ensure HTTPS is available, certificates are valid and renewed, HTTP redirects to HTTPS, and HSTS is configured after validation.",
    }),
    fixedItem({
      categoryName: "Injection",
      evidenceSummary:
        "Current scanner does not submit forms or test injection payloads.",
      limitationNote:
        "Do not create or infer injection findings without direct evidence.",
      recommendation:
        "Use manual or authorized dynamic testing for SQL, command, template, and script injection risks.",
    }),
    fixedItem({
      categoryName: "Insecure Design",
      evidenceSummary: "Requires manual architecture review.",
      limitationNote:
        "Automated surface checks cannot validate threat modeling, trust boundaries, or abuse-case design.",
      recommendation:
        "Review architecture, threat models, business logic, and abuse-case controls manually.",
    }),
    attentionOrPassedItem({
      categoryName: "Security Misconfiguration",
      completed:
        completedModules.httpHeaders === true &&
        completedModules.techDetection === true,
      findings: misconfigurationFindings,
      limitationNote:
        "This covers implemented HTTP header, technology detection, public path, server header, and XML-RPC observations only.",
      noIssueEvidence:
        "No issue detected by completed automated security misconfiguration checks.",
      notCheckedEvidence:
        "HTTP headers and technology detection checks have not both completed for this scan.",
      recommendation:
        "Harden response headers, reduce version disclosure, remove unintended public files or admin tools, and restrict unnecessary endpoints.",
    }),
    buildVulnerableComponentsItem(completedModules, findings),
    buildIdentificationAuthItem(completedModules, findings),
    fixedItem({
      categoryName: "Software and Data Integrity Failures",
      evidenceSummary:
        "Current scanner does not verify CI/CD, dependencies, package signing, or integrity controls.",
      limitationNote:
        "Requires repository, deployment, dependency, and release process review.",
      recommendation:
        "Review dependency integrity controls, signed builds, deployment protections, and supply-chain processes manually.",
    }),
    fixedItem({
      categoryName: "Security Logging and Monitoring Failures",
      evidenceSummary:
        "Requires application-side logging review and manual validation.",
      limitationNote:
        "External safe checks cannot confirm audit logs, alerting, retention, or incident response coverage.",
      recommendation:
        "Validate security event logging, alerting, retention, and incident response workflows manually.",
    }),
    fixedItem({
      categoryName: "Server-Side Request Forgery",
      evidenceSummary:
        "Not checked for target app vulnerabilities. Scanner-side SSRF protection does not test the target application for SSRF.",
      limitationNote:
        "Do not interpret scanner SSRF protections as evidence that the target is safe from SSRF.",
      recommendation:
        "Review outbound request features, URL fetchers, webhooks, metadata access controls, and network egress restrictions manually.",
    }),
  ];
  const manualItems = checklistItems.filter((item) => item.status === "NOT_CHECKED");

  return {
    checklistItems,
    logs: [
      {
        level: "INFO",
        message: "OWASP checklist builder generated checklist items",
        metadata: {
          checklistItemCount: checklistItems.length,
        },
      },
    ],
    remediationSummary: buildRemediationSummary(findings, manualItems),
  };
}
