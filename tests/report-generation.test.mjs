import assert from "node:assert/strict";
import test from "node:test";

import { ReportGenerationError } from "../src/lib/reports/reportData.ts";
import { renderReportHtml } from "../src/lib/reports/reportHtml.ts";
import { generateReportForScanWithDependencies } from "../src/lib/reports/reportService.ts";

function reportData(overrides = {}) {
  const now = new Date("2026-05-14T00:00:00.000Z");

  return {
    categoryScores: [
      {
        category: "HTTP Security Headers",
        explanation: "Based on findings from completed scanner modules",
        findingCount: 1,
        grade: "B",
        score: 85,
        severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, INFO: 0 },
        status: "Findings detected by completed automated checks",
      },
      {
        category: "SSL/TLS",
        explanation: "No issue detected by completed automated checks",
        findingCount: 0,
        grade: "A",
        score: 100,
        severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
        status: "No issue detected by completed automated checks",
      },
      {
        category: "Email Security",
        explanation: "No issue detected by completed automated checks",
        findingCount: 0,
        grade: "A",
        score: 100,
        severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
        status: "No issue detected by completed automated checks",
      },
      {
        category: "Technology Detection",
        explanation: "No issue detected by completed automated checks",
        findingCount: 1,
        grade: "A",
        score: 100,
        severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 1 },
        status: "Findings detected by completed automated checks",
      },
    ],
    emailSummary: null,
    findings: [
      {
        category: "HTTP Security Headers",
        confidence: "HIGH",
        createdAt: now,
        evidence: "Content-Security-Policy header was not present.",
        fix: "Use the saved scanner recommendation.",
        id: "finding-1",
        impact: "Browser-side hardening is reduced.",
        owaspMapping: "A05 Security Misconfiguration",
        severity: "HIGH",
        title: "Missing Content-Security-Policy header",
      },
      {
        category: "Technology Detection",
        confidence: "LOW",
        createdAt: now,
        evidence: "Path returned HTTP 200, but no product-specific exposure indicators were found.",
        fix: "Review manually if needed.",
        id: "finding-2",
        impact: "Observation only.",
        owaspMapping: null,
        severity: "INFO",
        title: "Generic inconclusive public path observation",
      },
    ],
    headerSummary: [
      {
        findingTitles: ["Missing Content-Security-Policy header"],
        name: "Content-Security-Policy",
        note: null,
        status: "Missing",
      },
    ],
    owaspChecklistItems: [],
    remediationSummary: {
      immediateAttention: [
        {
          category: "HTTP Security Headers",
          recommendation: "Use the saved scanner recommendation.",
          severity: "HIGH",
          title: "Missing Content-Security-Policy header",
        },
      ],
      informationalObservations: [],
      manualReview: [],
      recommendedHardening: [],
    },
    scan: {
      completedAt: now,
      createdAt: now,
      grade: "B",
      id: "scan-1",
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanType: "PROFESSIONAL",
      score: 85,
      status: "COMPLETED",
      targetUrl: "example.com",
    },
    scoreExplanation: {
      findingsCounted: 1,
      grade: "B",
      highestSeverityFound: "HIGH",
      notes: [],
      penaltySummary: "1 High x 15",
      score: 85,
      title: "Automated posture score",
      totalPenalty: 15,
    },
    severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, INFO: 1 },
    sslSummary: null,
    techSummary: {
      exposedPathChecks: [
        {
          confidence: "LOW",
          error: null,
          evidence: "No product-specific exposure indicators were found.",
          findingTitle: null,
          path: "/readme.html",
          status: "Inconclusive",
          statusCode: 200,
          url: "https://example.com/readme.html",
        },
      ],
      homepageFinalUrl: "https://example.com",
      homepageStatusCode: 200,
      serverHeader: "nginx",
      technologiesDetected: ["WordPress"],
      woocommerceDetected: false,
      woocommerceEvidence: [],
      wordpressDetected: true,
      wordpressEvidence: ["wp-content marker"],
      xmlRpcAccessible: false,
      xmlRpcEvidence: null,
    },
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    buildData: async () => reportData(),
    canDownload: async () => true,
    createOrUpdate: async () => ({ id: "report-1" }),
    deductCredit: async () => ({ creditsRemaining: 0, success: true }),
    generatePdf: async () => {},
    getBranding: async () => ({ branding: null, reportType: "PROFESSIONAL" }),
    getExisting: async () => null,
    renderHtml: () => "<html></html>",
    ...overrides,
  };
}

test("PDF HTML includes disclaimer", () => {
  const html = renderReportHtml(reportData());

  assert.match(html, /automated safe checks only/i);
  assert.match(html, /not a penetration test/i);
});

test("Basic PDF HTML includes only basic report framing and sections", () => {
  const base = reportData();
  const html = renderReportHtml({
    ...base,
    scan: {
      ...base.scan,
      scanType: "BASIC",
    },
  });

  assert.match(html, /Basic Website Security Posture Report/);
  assert.match(html, /Scan type<\/span><strong>BASIC<\/strong>/);
  assert.match(html, /HTTP Security Headers/);
  assert.match(html, /SSL\/TLS/);
  assert.match(html, /Email Security/);
  assert.match(html, /Basic Technology Detection/);
  assert.match(html, /Basic Recommendations/);
  assert.equal(html.includes("OWASP-aligned posture checklist"), false);
  assert.equal(html.includes("Priority Remediation Summary"), false);
});

test("Basic PDF HTML does not render white-label branding", () => {
  const base = reportData();
  const html = renderReportHtml(
    {
      ...base,
      scan: {
        ...base.scan,
        scanType: "BASIC",
      },
    },
    new Date("2026-05-14T00:00:00.000Z"),
    {
      address: null,
      agencyLogoDataUri: null,
      agencyName: "Acme Security",
      contactEmail: "reports@acme.test",
      footerText: "Prepared for client review",
      logoPath: null,
      logoUrl: null,
      primaryColor: "#123456",
      secondaryColor: null,
      showPoweredBy: false,
      websiteUrl: "https://acme.test",
    },
  );

  assert.equal(html.includes("Acme Security"), false);
  assert.equal(html.includes("Prepared for client review"), false);
});

test("PDF HTML uses default branding when white-label is not available", () => {
  const html = renderReportHtml(reportData());

  assert.match(html, /SMB Security Report Generator/);
  assert.match(html, /Generated by SMB Security Report Generator/);
});

test("PDF HTML uses agency branding when white-label is available", () => {
  const html = renderReportHtml(reportData(), new Date("2026-05-14T00:00:00.000Z"), {
    address: null,
    agencyName: "Acme Security",
    agencyLogoDataUri: null,
    contactEmail: "reports@acme.test",
    footerText: "Prepared for client review",
    logoPath: null,
    logoUrl: null,
    primaryColor: "#123456",
    secondaryColor: null,
    showPoweredBy: false,
    websiteUrl: "https://acme.test",
  });

  assert.match(html, /Acme Security/);
  assert.match(html, /reports@acme.test/);
  assert.equal(html.includes("Powered by SMB Security Report Generator"), false);
});

test("PDF HTML renders agency logo data URI on cover", () => {
  const logoDataUri =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const html = renderReportHtml(reportData(), new Date("2026-05-14T00:00:00.000Z"), {
    address: null,
    agencyLogoDataUri: logoDataUri,
    agencyName: "Acme Security",
    contactEmail: null,
    footerText: "Prepared for client review",
    logoPath: "not-rendered-directly.png",
    logoUrl: "/agency-assets/user/logo.png",
    primaryColor: "#123456",
    secondaryColor: null,
    showPoweredBy: true,
    websiteUrl: null,
  });

  assert.equal(html.includes(`src="${logoDataUri}"`), true);
  assert.match(html, /alt="Agency logo"/);
  assert.equal(html.includes("file:///"), false);
  assert.match(html, /max-width: 160px/);
  assert.match(html, /max-height: 70px/);
  assert.match(html, /object-fit: contain/);
});

test("PDF HTML does not use logo file paths directly", () => {
  const html = renderReportHtml(reportData(), new Date("2026-05-14T00:00:00.000Z"), {
    address: null,
    agencyLogoDataUri: null,
    agencyName: "Acme Security",
    contactEmail: null,
    footerText: "Prepared for client review",
    logoPath: "E:\\Project\\SMB Security Report Generator\\09\\SMB\\public\\agency-assets\\user\\logo.png",
    logoUrl: "/agency-assets/user/logo.png",
    primaryColor: "#123456",
    secondaryColor: null,
    showPoweredBy: true,
    websiteUrl: null,
  });

  assert.equal(html.includes("<img class=\"brand-logo\""), false);
  assert.equal(html.includes("agency-assets"), false);
  assert.equal(html.includes("file:///"), false);
});

test("PDF HTML keeps required disclaimer in white-label mode", () => {
  const html = renderReportHtml(reportData(), new Date("2026-05-14T00:00:00.000Z"), {
    address: null,
    agencyName: "Acme Security",
    agencyLogoDataUri: null,
    contactEmail: null,
    footerText: "Prepared for client review",
    logoPath: null,
    logoUrl: null,
    primaryColor: "#123456",
    secondaryColor: null,
    showPoweredBy: false,
    websiteUrl: null,
  });

  assert.match(html, /automated safe checks only/i);
  assert.match(html, /not a penetration test/i);
  assert.match(html, /not.*full OWASP compliance audit/i);
});

test("PDF HTML escapes agency text", () => {
  const html = renderReportHtml(reportData(), new Date("2026-05-14T00:00:00.000Z"), {
    address: null,
    agencyName: "<script>alert(1)</script>",
    agencyLogoDataUri: null,
    contactEmail: null,
    footerText: "<b>Prepared</b>",
    logoPath: null,
    logoUrl: null,
    primaryColor: "#123456",
    secondaryColor: null,
    showPoweredBy: false,
    websiteUrl: null,
  });

  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;Prepared&lt;\/b&gt;/);
});

test("PDF HTML includes score and grade", () => {
  const html = renderReportHtml(reportData());

  assert.match(html, /85\/100/);
  assert.match(html, />B</);
});

test("PDF HTML does not contain banned claims", () => {
  const html = renderReportHtml(reportData()).toLowerCase();

  assert.equal(html.includes("owasp compliant"), false);
  assert.equal(html.includes("website is secure"), false);
  assert.equal(html.includes("passed owasp"), false);
  assert.equal(html.includes("security certified"), false);
  assert.equal(html.includes("pentest score"), false);
  assert.equal(html.includes("no vulnerabilities found"), false);
});

test("inconclusive tech paths are not shown as vulnerabilities", () => {
  const html = renderReportHtml(reportData()).toLowerCase();

  assert.match(html, /inconclusive/);
  assert.equal(html.includes("inconclusive vulnerability"), false);
});

test("Score Explanation is merged into Executive Summary area", () => {
  const html = renderReportHtml(reportData());

  assert.equal(html.includes("<h2>Score Explanation</h2>"), false);
  assert.match(html, /Automated posture score/);
});

test("PDF HTML uses universal wrapping CSS", () => {
  const html = renderReportHtml(reportData());

  assert.match(html, /overflow-wrap: anywhere/);
  assert.match(html, /word-break: break-word/);
  assert.match(html, /min-width: 0/);
});

test("certificate dates are human-readable instead of raw ISO strings", () => {
  const html = renderReportHtml(
    reportData({
      sslSummary: {
        authorizationError: null,
        certificateExists: true,
        certificateValid: true,
        daysUntilExpiry: 30,
        expired: false,
        hostnameMatched: true,
        httpRedirectFinalUrl: "https://example.com",
        httpRedirectsToHttps: true,
        httpsAvailable: true,
        httpsError: null,
        issuer: "Example CA",
        subject: "example.com",
        validFrom: "2026-04-20T08:37:23.000Z",
        validTo: "2026-05-20T08:37:23.000Z",
      },
    }),
  );

  assert.equal(html.includes("2026-04-20T08:37:23.000Z"), false);
  assert.equal(html.includes("2026-05-20T08:37:23.000Z"), false);
  assert.match(html, /Apr 20, 2026/);
});

test("Security Misconfiguration recommendation is header-specific when only header findings exist", () => {
  const html = renderReportHtml(
    reportData({
      owaspChecklistItems: [
        {
          categoryName: "Security Misconfiguration",
          evidenceSummary: "HTTP header findings were saved.",
          limitationNote: "Automated checks only.",
          recommendation:
            "Review public files, admin tools, XML-RPC, and response headers.",
          relatedFindings: [
            {
              category: "HTTP Security Headers",
              evidence: "Content-Security-Policy header was not present.",
              fix: "Use the saved scanner recommendation.",
              severity: "HIGH",
              title: "Missing Content-Security-Policy header",
            },
          ],
          severitySummary: "High",
          status: "ATTENTION_REQUIRED",
        },
      ],
    }),
  );

  assert.match(
    html,
    /Harden missing response headers and review remaining configuration findings/,
  );
  assert.equal(html.includes("XML-RPC, and response headers"), false);
});

test("Identification and Authentication shows OBSERVATION for saved Email Security INFO observations", () => {
  const html = renderReportHtml(
    reportData({
      findings: [
        ...reportData().findings,
        {
          category: "Email Security",
          confidence: "HIGH",
          createdAt: new Date("2026-05-14T00:00:00.000Z"),
          evidence: "MX records were not found and SPF/DMARC indicate the domain may not receive mail.",
          fix: "If the domain sends mail, confirm SPF, DKIM, DMARC, and MX with the mail provider.",
          id: "finding-email-info",
          impact: "Observation only.",
          owaspMapping:
            "Identification and Authentication Failures / Security Misconfiguration",
          severity: "INFO",
          title: "Domain appears configured not to receive mail",
        },
      ],
      owaspChecklistItems: [
        {
          categoryName: "Identification and Authentication Failures",
          evidenceSummary: "No issue detected by completed automated checks.",
          limitationNote: "Automated checks only.",
          recommendation: "No immediate action from automated checks.",
          relatedFindings: [],
          severitySummary: "No related findings.",
          status: "PASSED",
        },
      ],
    }),
  );

  assert.match(html, /OBSERVATION/);
  assert.match(html, /Domain appears configured not to receive mail/);
  assert.match(html, /Related findings count<\/th><td class="wrap">1/);
  assert.match(
    html,
    /This is an email posture observation and not proof of authentication weakness/,
  );
});

test("Tech Detection public paths render as compact cards instead of an orphan-prone table", () => {
  const html = renderReportHtml(reportData());

  assert.match(html, /class="tech-path-grid"/);
  assert.match(html, /class="tech-path-card"/);
  assert.equal(html.includes("<thead><tr><th>Path</th><th>Status</th>"), false);
});

test("plan entitlement block prevents Basic PDF generation before credit deduction", async () => {
  let creditDeducted = false;
  let pdfGenerated = false;
  let loggedBlock = null;
  const base = reportData();

  await assert.rejects(
    generateReportForScanWithDependencies(
      "scan-1",
      "user-1",
      dependencies({
        buildData: async () => ({
          ...base,
          scan: {
            ...base.scan,
            scanType: "BASIC",
          },
        }),
        checkPdfEntitlement: async () => ({
          allowed: false,
          planId: "plan-basic-blocked",
          planName: "Blocked Plan",
          planSlug: "blocked-plan",
          reason: "Your current plan does not include Basic PDF reports.",
        }),
        deductCredit: async () => {
          creditDeducted = true;
          return { creditsRemaining: 0, success: true };
        },
        generatePdf: async () => {
          pdfGenerated = true;
        },
        logEntitlementBlock: async (input) => {
          loggedBlock = input;
        },
      }),
    ),
    /Basic PDF reports/,
  );

  assert.equal(creditDeducted, false);
  assert.equal(pdfGenerated, false);
  assert.equal(loggedBlock?.scanType, "BASIC");
});

test("legacy or invalid scan types fall back to Professional entitlement checks", async () => {
  let checkedScanType = null;
  const base = reportData();

  await assert.rejects(
    generateReportForScanWithDependencies(
      "scan-1",
      "user-1",
      dependencies({
        buildData: async () => ({
          ...base,
          scan: {
            ...base.scan,
            scanType: "legacy-type",
          },
        }),
        checkPdfEntitlement: async (_userId, scanType) => {
          checkedScanType = scanType;

          return {
            allowed: false,
            reason: "Your current plan does not include Professional PDF reports.",
          };
        },
      }),
    ),
    /Professional PDF reports/,
  );

  assert.equal(checkedScanType, "PROFESSIONAL");
});

test("no credits blocks before PDF generation starts", async () => {
  let pdfGenerated = false;

  await assert.rejects(
    generateReportForScanWithDependencies(
      "scan-1",
      "user-1",
      dependencies({
        canDownload: async () => false,
        generatePdf: async () => {
          pdfGenerated = true;
        },
      }),
    ),
    /No report credits available/,
  );

  assert.equal(pdfGenerated, false);
});

test("credit is deducted only after successful PDF generation", async () => {
  const calls = [];

  await generateReportForScanWithDependencies(
    "scan-1",
    "user-1",
    dependencies({
      deductCredit: async () => {
        calls.push("deduct");
        return { creditsRemaining: 0, success: true };
      },
      generatePdf: async () => {
        calls.push("pdf");
      },
    }),
  );

  assert.deepEqual(calls, ["pdf", "deduct"]);
});

test("no duplicate notification is sent when finalize reuses an existing generated report", async () => {
  let notified = false;
  const result = await generateReportForScanWithDependencies(
    "scan-1",
    "user-1",
    dependencies({
      finalizeGeneratedReport: async () => ({
        charged: false,
        reportId: "existing-report-1",
      }),
      notifyGenerated: async () => {
        notified = true;
      },
    }),
  );

  assert.equal(result.reportId, "existing-report-1");
  assert.equal(result.downloadUrl, "/api/reports/existing-report-1/download");
  assert.equal(notified, false);
});

test("credit is not deducted when PDF generation fails", async () => {
  let deducted = false;

  await assert.rejects(
    generateReportForScanWithDependencies(
      "scan-1",
      "user-1",
      dependencies({
        deductCredit: async () => {
          deducted = true;
          return { creditsRemaining: 0, success: true };
        },
        generatePdf: async () => {
          throw new Error("browser failed");
        },
      }),
    ),
    ReportGenerationError,
  );

  assert.equal(deducted, false);
});

test("cannot generate PDF for non-completed scan", async () => {
  await assert.rejects(
    generateReportForScanWithDependencies(
      "scan-1",
      "user-1",
      dependencies({
        buildData: async () => {
          throw new ReportGenerationError(
            "PDF reports can only be generated for completed scans.",
            "NOT_COMPLETED",
          );
        },
      }),
    ),
    /completed scans/,
  );
});

test("cannot generate PDF for another user's scan", async () => {
  await assert.rejects(
    generateReportForScanWithDependencies(
      "scan-1",
      "user-2",
      dependencies({
        buildData: async () => {
          throw new ReportGenerationError("Scan was not found.", "NOT_FOUND");
        },
      }),
    ),
    /not found/,
  );
});

test("basic scan report saves BASIC report type and does not request branding", async () => {
  let savedReportType = null;
  let brandingRequested = false;
  const base = reportData();

  await generateReportForScanWithDependencies(
    "scan-1",
    "user-1",
    dependencies({
      buildData: async () => ({
        ...base,
        scan: {
          ...base.scan,
          scanType: "BASIC",
        },
      }),
      createOrUpdate: async (args) => {
        savedReportType = args.reportType;
        return { id: "report-1" };
      },
      getBranding: async () => {
        brandingRequested = true;
        return { branding: null, reportType: "PROFESSIONAL" };
      },
    }),
  );

  assert.equal(savedReportType, "BASIC");
  assert.equal(brandingRequested, false);
});
