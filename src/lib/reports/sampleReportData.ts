import type { ReportData } from "./reportData.ts";

export const sampleReportDisclaimer =
  "This is a sample report based on demo data. Actual reports are generated from safe automated checks only. This is not a penetration test, security certification, or full OWASP compliance audit.";

export const sampleGeneratedAt = new Date("2026-05-14T10:30:00.000Z");

export const sampleSeverityCounts = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 3,
  LOW: 1,
  INFO: 1,
};

export const sampleFindings: ReportData["findings"] = [
  {
    category: "HTTP Security Headers",
    confidence: "HIGH",
    createdAt: sampleGeneratedAt,
    evidence: "SAMPLE/DEMO: Content-Security-Policy was not present in the demo homepage response.",
    fix: "SAMPLE/DEMO: Add a Content-Security-Policy header, test in report-only mode first, and tighten allowed sources over time.",
    id: "sample-finding-csp",
    impact:
      "Browser-side defenses against script injection and content loading abuse are weaker without this header.",
    owaspMapping: "A05 Security Misconfiguration",
    severity: "HIGH",
    title: "SAMPLE/DEMO: Missing Content-Security-Policy header",
  },
  {
    category: "HTTP Security Headers",
    confidence: "HIGH",
    createdAt: sampleGeneratedAt,
    evidence: "SAMPLE/DEMO: Permissions-Policy was not present in the demo homepage response.",
    fix: "SAMPLE/DEMO: Add a Permissions-Policy header that disables unused browser capabilities.",
    id: "sample-finding-permissions-policy",
    impact:
      "Unused browser features may remain available to pages or embedded content.",
    owaspMapping: "A05 Security Misconfiguration",
    severity: "MEDIUM",
    title: "SAMPLE/DEMO: Missing Permissions-Policy header",
  },
  {
    category: "HTTP Security Headers",
    confidence: "HIGH",
    createdAt: sampleGeneratedAt,
    evidence: "SAMPLE/DEMO: Strict-Transport-Security was present with max-age=86400.",
    fix: "SAMPLE/DEMO: Increase HSTS max-age after confirming HTTPS works consistently across the domain.",
    id: "sample-finding-hsts-short",
    impact:
      "A short HSTS duration reduces the persistence of HTTPS-only browser enforcement.",
    owaspMapping: "A02 Cryptographic Failures / A05 Security Misconfiguration",
    severity: "MEDIUM",
    title: "SAMPLE/DEMO: HSTS max-age short",
  },
  {
    category: "Email Security",
    confidence: "HIGH",
    createdAt: sampleGeneratedAt,
    evidence: "SAMPLE/DEMO: No DMARC TXT record was observed for _dmarc.example-business.com.",
    fix: "SAMPLE/DEMO: Publish a DMARC record, start with monitoring if needed, and move toward an enforcement policy.",
    id: "sample-finding-dmarc",
    impact:
      "Email spoofing protection and reporting are weaker when DMARC is missing.",
    owaspMapping: "Identification and Authentication Failures / Security Misconfiguration",
    severity: "MEDIUM",
    title: "SAMPLE/DEMO: Missing DMARC record",
  },
  {
    category: "Technology Detection",
    confidence: "MEDIUM",
    createdAt: sampleGeneratedAt,
    evidence: "SAMPLE/DEMO: Demo response markers referenced wp-content and wp-includes paths.",
    fix: "SAMPLE/DEMO: Keep WordPress core, themes, and plugins updated and remove unnecessary public version indicators where practical.",
    id: "sample-finding-wordpress",
    impact:
      "Technology identification helps prioritize maintenance checks, but this observation alone is not proof of compromise.",
    owaspMapping: "A05 Security Misconfiguration",
    severity: "INFO",
    title: "SAMPLE/DEMO: WordPress indicators observed",
  },
  {
    category: "Technology Detection",
    confidence: "MEDIUM",
    createdAt: sampleGeneratedAt,
    evidence: "SAMPLE/DEMO: /xmlrpc.php returned an accessible demo response.",
    fix: "SAMPLE/DEMO: Disable XML-RPC if not needed or restrict access through the hosting/security layer.",
    id: "sample-finding-xmlrpc",
    impact:
      "An unnecessary XML-RPC endpoint can increase automated abuse surface on WordPress sites.",
    owaspMapping: "A05 Security Misconfiguration",
    severity: "LOW",
    title: "SAMPLE/DEMO: XML-RPC endpoint accessible",
  },
];

export const sampleHeaderSummary: ReportData["headerSummary"] = [
  {
    findingTitles: ["SAMPLE/DEMO: Missing Content-Security-Policy header"],
    name: "Content-Security-Policy",
    note: null,
    status: "Missing",
  },
  {
    findingTitles: ["SAMPLE/DEMO: HSTS max-age short"],
    name: "Strict-Transport-Security",
    note: "SAMPLE/DEMO: Present, but max-age is shorter than recommended.",
    status: "Weak",
  },
  {
    findingTitles: [],
    name: "X-Frame-Options",
    note: "SAMPLE/DEMO: Present with SAMEORIGIN.",
    status: "Present",
  },
  {
    findingTitles: [],
    name: "X-Content-Type-Options",
    note: "SAMPLE/DEMO: Present with nosniff.",
    status: "Present",
  },
  {
    findingTitles: ["SAMPLE/DEMO: Missing Permissions-Policy header"],
    name: "Permissions-Policy",
    note: null,
    status: "Missing",
  },
  {
    findingTitles: [],
    name: "Referrer-Policy",
    note: "SAMPLE/DEMO: Present with strict-origin-when-cross-origin.",
    status: "Present",
  },
];

export const sampleOwaspChecklistItems: ReportData["owaspChecklistItems"] = [
  {
    categoryName: "Security Misconfiguration",
    evidenceSummary:
      "SAMPLE/DEMO: Header hardening gaps and an accessible XML-RPC endpoint are shown in demo findings.",
    limitationNote:
      "SAMPLE/DEMO: This preview maps only safe automated observations and is not a full OWASP audit.",
    recommendation:
      "Harden response headers, review unnecessary public endpoints, and keep CMS components maintained.",
    relatedFindings: sampleFindings
      .filter((finding) =>
        ["HTTP Security Headers", "Technology Detection"].includes(
          finding.category,
        ),
      )
      .map((finding) => ({
        category: finding.category,
        evidence: finding.evidence,
        fix: finding.fix,
        id: finding.id,
        severity: finding.severity,
        title: finding.title,
      })),
    severitySummary: "SAMPLE/DEMO: One high, two medium, one low, and one info observation.",
    status: "ATTENTION_REQUIRED",
  },
  {
    categoryName: "Cryptographic Failures",
    evidenceSummary:
      "SAMPLE/DEMO: HTTPS is available and the certificate is valid, but HSTS duration is short.",
    limitationNote:
      "SAMPLE/DEMO: This is a transport posture preview, not a cryptographic audit.",
    recommendation:
      "Increase HSTS duration after confirming HTTPS coverage across the production site.",
    relatedFindings: [
      {
        category: "HTTP Security Headers",
        evidence: "SAMPLE/DEMO: Strict-Transport-Security was present with max-age=86400.",
        fix: "SAMPLE/DEMO: Increase HSTS max-age after confirming HTTPS works consistently across the domain.",
        id: "sample-finding-hsts-short",
        severity: "MEDIUM",
        title: "SAMPLE/DEMO: HSTS max-age short",
      },
    ],
    severitySummary: "SAMPLE/DEMO: Medium hardening item.",
    status: "OBSERVATION",
  },
  {
    categoryName: "Identification and Authentication Failures",
    evidenceSummary:
      "SAMPLE/DEMO: Missing DMARC is shown as an email authentication posture issue.",
    limitationNote:
      "SAMPLE/DEMO: DNS checks do not validate mailbox ownership or user authentication controls.",
    recommendation:
      "Publish DMARC and confirm SPF/DKIM alignment with the mail provider.",
    relatedFindings: [
      {
        category: "Email Security",
        evidence:
          "SAMPLE/DEMO: No DMARC TXT record was observed for _dmarc.example-business.com.",
        fix: "SAMPLE/DEMO: Publish a DMARC record, start with monitoring if needed, and move toward an enforcement policy.",
        id: "sample-finding-dmarc",
        severity: "MEDIUM",
        title: "SAMPLE/DEMO: Missing DMARC record",
      },
    ],
    severitySummary: "SAMPLE/DEMO: Medium email authentication finding.",
    status: "OBSERVATION",
  },
];

export const sampleReportData: ReportData = {
  categoryScores: [
    {
      category: "HTTP Security Headers",
      explanation:
        "SAMPLE/DEMO: Header hardening issues were included in the static demo findings.",
      findingCount: 3,
      grade: "C",
      score: 68,
      severityCounts: {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 0,
        INFO: 0,
      },
      status: "SAMPLE/DEMO: Attention recommended",
    },
    {
      category: "SSL/TLS",
      explanation:
        "SAMPLE/DEMO: HTTPS and certificate checks look healthy in this preview.",
      findingCount: 0,
      grade: "A",
      score: 94,
      severityCounts: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0,
      },
      status: "SAMPLE/DEMO: No direct SSL/TLS finding in this preview",
    },
    {
      category: "Email Security",
      explanation:
        "SAMPLE/DEMO: DMARC is missing while SPF and MX are present in demo DNS data.",
      findingCount: 1,
      grade: "C",
      score: 72,
      severityCounts: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 1,
        LOW: 0,
        INFO: 0,
      },
      status: "SAMPLE/DEMO: Authentication policy hardening recommended",
    },
    {
      category: "Technology Detection",
      explanation:
        "SAMPLE/DEMO: WordPress markers and XML-RPC accessibility are shown as static observations.",
      findingCount: 2,
      grade: "B",
      score: 82,
      severityCounts: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 1,
        INFO: 1,
      },
      status: "SAMPLE/DEMO: Review unnecessary exposed CMS surface",
    },
  ],
  emailSummary: {
    dkimErrorCount: 0,
    dkimSelectorsFound: ["selector1"],
    dkimSelectorsTested: ["default", "google", "selector1", "selector2"],
    dmarcFound: false,
    dmarcPolicy: null,
    dmarcRecord: null,
    domain: "example-business.com",
    mxFound: true,
    mxRecords: [
      { exchange: "mail.example-business.com", priority: 10 },
      { exchange: "backup-mail.example-business.com", priority: 20 },
    ],
    spfAssessment: "SAMPLE/DEMO: SPF record observed with a managed email provider include.",
    spfFound: true,
    spfRecord: "v=spf1 include:_spf.example-mail.test ~all",
  },
  findings: sampleFindings,
  headerSummary: sampleHeaderSummary,
  owaspChecklistItems: sampleOwaspChecklistItems,
  remediationSummary: {
    immediateAttention: [
      {
        category: "HTTP Security Headers",
        recommendation:
          "SAMPLE/DEMO: Define and test Content-Security-Policy before enforcing it.",
        severity: "HIGH",
        title: "SAMPLE/DEMO: Missing Content-Security-Policy header",
      },
      {
        category: "Email Security",
        recommendation:
          "SAMPLE/DEMO: Publish DMARC with reporting, then progress toward quarantine or reject after review.",
        severity: "MEDIUM",
        title: "SAMPLE/DEMO: Missing DMARC record",
      },
    ],
    informationalObservations: [
      {
        category: "Technology Detection",
        recommendation:
          "SAMPLE/DEMO: Maintain WordPress and plugin updates; this observation alone is not a vulnerability claim.",
        severity: "INFO",
        title: "SAMPLE/DEMO: WordPress indicators observed",
      },
    ],
    manualReview: [
      {
        category: "OWASP Checklist",
        recommendation:
          "SAMPLE/DEMO: Business logic, authentication, authorization, and source-code review require manual assessment outside this automated preview.",
        severity: "INFO",
        title: "SAMPLE/DEMO: Manual review areas not checked",
      },
    ],
    recommendedHardening: [
      {
        category: "HTTP Security Headers",
        recommendation:
          "SAMPLE/DEMO: Add Permissions-Policy and increase HSTS duration after rollout validation.",
        severity: "MEDIUM",
        title: "SAMPLE/DEMO: Header hardening improvements",
      },
      {
        category: "Technology Detection",
        recommendation:
          "SAMPLE/DEMO: Disable or restrict XML-RPC if the site does not require it.",
        severity: "LOW",
        title: "SAMPLE/DEMO: XML-RPC endpoint accessible",
      },
    ],
  },
  scan: {
    completedAt: sampleGeneratedAt,
    createdAt: sampleGeneratedAt,
    grade: "C",
    id: "sample-demo-report",
    normalizedUrl: "https://example-business.com",
    rootDomain: "example-business.com",
    scanType: "PROFESSIONAL",
    score: 74,
    status: "SAMPLE DEMO",
    targetUrl: "example-business.com",
  },
  scoreExplanation: {
    findingsCounted: 5,
    grade: "C",
    highestSeverityFound: "HIGH",
    notes: ["SAMPLE/DEMO: Info observations are displayed but do not reduce score."],
    penaltySummary: "SAMPLE/DEMO: 1 high, 3 medium, and 1 low finding counted.",
    score: 74,
    title: "Automated posture score",
    totalPenalty: 26,
  },
  severityCounts: sampleSeverityCounts,
  sslSummary: {
    authorizationError: null,
    certificateExists: true,
    certificateValid: true,
    daysUntilExpiry: 84,
    expired: false,
    hostnameMatched: true,
    httpRedirectFinalUrl: "https://example-business.com/",
    httpRedirectsToHttps: true,
    httpsAvailable: true,
    httpsError: null,
    issuer: "SAMPLE/DEMO Example CA",
    subject: "example-business.com",
    validFrom: "2026-04-01T00:00:00.000Z",
    validTo: "2026-08-07T00:00:00.000Z",
  },
  techSummary: {
    exposedPathChecks: [
      {
        confidence: "MEDIUM",
        error: null,
        evidence: "SAMPLE/DEMO: Demo endpoint returned HTTP 200.",
        findingTitle: "SAMPLE/DEMO: XML-RPC endpoint accessible",
        path: "/xmlrpc.php",
        status: "Reachable",
        statusCode: 200,
        url: "https://example-business.com/xmlrpc.php",
      },
      {
        confidence: "HIGH",
        error: null,
        evidence: "SAMPLE/DEMO: Demo endpoint returned HTTP 404.",
        findingTitle: null,
        path: "/robots.txt",
        status: "Not found",
        statusCode: 404,
        url: "https://example-business.com/robots.txt",
      },
    ],
    homepageFinalUrl: "https://example-business.com/",
    homepageStatusCode: 200,
    serverHeader: "SAMPLE/DEMO nginx",
    technologiesDetected: ["WordPress", "nginx", "PHP"],
    woocommerceDetected: false,
    woocommerceEvidence: [],
    wordpressDetected: true,
    wordpressEvidence: ["SAMPLE/DEMO: wp-content marker observed"],
    xmlRpcAccessible: true,
    xmlRpcEvidence: "SAMPLE/DEMO: /xmlrpc.php returned HTTP 200",
  },
};
