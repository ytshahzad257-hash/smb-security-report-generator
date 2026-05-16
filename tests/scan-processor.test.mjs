import assert from "node:assert/strict";
import test from "node:test";

import {
  failScanJob,
  processScanJob,
} from "../src/lib/scans/scanProcessor.ts";
import { ScanProcessingError } from "../src/lib/scans/scanLifecycle.ts";

function createMockPrisma(scan) {
  const findings = [];
  const updates = [];
  const logs = [];
  const prisma = {
    scan: {
      async findUnique() {
        return scan;
      },
      async update(args) {
        updates.push(args);
        return args;
      },
    },
    finding: {
      async createMany(args) {
        findings.push(...args.data);
        return { count: args.data.length };
      },
      async deleteMany(args) {
        const { category, scanId } = args.where;

        for (let index = findings.length - 1; index >= 0; index -= 1) {
          if (
            findings[index].scanId === scanId &&
            findings[index].category === category
          ) {
            findings.splice(index, 1);
          }
        }

        return { count: 0 };
      },
    },
    scanLog: {
      async create(args) {
        logs.push(args.data);
        return args;
      },
      async deleteMany(args) {
        const messages = new Set(args.where.message.in);

        for (let index = logs.length - 1; index >= 0; index -= 1) {
          if (logs[index].scanId === args.where.scanId && messages.has(logs[index].message)) {
            logs.splice(index, 1);
          }
        }

        return { count: 0 };
      },
    },
  };

  return { findings, logs, prisma, updates };
}

function createHeaderScanResult(scanId = "scan_1") {
  const title = "Missing Content-Security-Policy header";

  return {
    finalUrl: "https://example.com",
    findings: [
      {
        scanId,
        title,
        severity: "MEDIUM",
        category: "HTTP Security Headers",
        owaspMapping: "Security Misconfiguration",
        evidence:
          "Content-Security-Policy header was not present in the HTTP response.",
        impact:
          "Without a CSP, browsers have less guidance to limit content sources.",
        fix: "Add a Content-Security-Policy response header.",
        confidence: "HIGH",
      },
    ],
    headerSummary: [
      {
        name: "Content-Security-Policy",
        status: "Missing",
        findingTitles: [title],
      },
    ],
    redirectsFollowed: 0,
    statusCode: 200,
  };
}

function createSslScanResult(scanId = "scan_1") {
  const title = "HTTP does not redirect to HTTPS";

  return {
    findings: [
      {
        scanId,
        title,
        severity: "MEDIUM",
        category: "SSL/TLS",
        owaspMapping: "Cryptographic Failures / Security Misconfiguration",
        evidence: "HTTP did not redirect to HTTPS.",
        impact: "Visitors who start on HTTP may remain unencrypted.",
        fix: "Redirect all HTTP requests to HTTPS.",
        confidence: "HIGH",
      },
    ],
    sslSummary: {
      authorizationError: null,
      certificateExists: true,
      certificateValid: true,
      checkedAt: "2026-05-13T00:00:00.000Z",
      daysUntilExpiry: 90,
      expired: false,
      hostnameMatched: true,
      httpRedirectFinalUrl: "http://example.com",
      httpRedirectsToHttps: false,
      httpRedirectStatusCode: 200,
      httpsAvailable: true,
      httpsError: null,
      issuer: "CN=Test Issuer",
      subject: "CN=example.com",
      subjectAltNames: ["DNS:example.com"],
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-08-11T00:00:00.000Z",
    },
  };
}

function createEmailScanResult(scanId = "scan_1") {
  const title = "Missing SPF record";

  return {
    emailSecuritySummary: {
      checkedAt: "2026-05-13T00:00:00.000Z",
      dkimErrorCount: 0,
      dkimSelectorsFound: ["default"],
      dkimSelectorsTested: [
        "default",
        "google",
        "selector1",
        "selector2",
        "k1",
        "mail",
        "smtp",
      ],
      dmarcError: null,
      dmarcFound: true,
      dmarcPolicy: "reject",
      dmarcRecord: "v=DMARC1; p=reject",
      domain: "example.com",
      mxError: null,
      mxFound: true,
      mxRecords: [
        {
          exchange: "mail.example.com",
          priority: 10,
        },
      ],
      spfAssessment: "Missing",
      spfError: null,
      spfFound: false,
      spfRecord: null,
    },
    findings: [
      {
        scanId,
        title,
        severity: "MEDIUM",
        category: "Email Security",
        owaspMapping:
          "Identification and Authentication Failures / Security Misconfiguration",
        evidence: "No SPF TXT record starting with v=spf1 was found.",
        impact:
          "Email receivers have less information to verify authorized senders.",
        fix: "Publish a valid SPF TXT record.",
        confidence: "HIGH",
      },
    ],
    logs: [],
  };
}

function createTechDetectionResult(scanId = "scan_1") {
  const title = "Server version exposed in response header";

  return {
    findings: [
      {
        scanId,
        title,
        severity: "LOW",
        category: "Technology Detection",
        owaspMapping: "Security Misconfiguration",
        evidence: "Apache/2.4.58",
        impact:
          "Detailed version disclosure can help attackers fingerprint the stack.",
        fix: "Reduce unnecessary version disclosure in response headers.",
        confidence: "HIGH",
      },
    ],
    logs: [],
    techSummary: {
      checkedAt: "2026-05-13T00:00:00.000Z",
      exposedPathChecks: [],
      homepageFinalUrl: "https://example.com",
      homepageStatusCode: 200,
      serverHeader: "Apache/2.4.58",
      technologiesDetected: ["Apache"],
      woocommerceDetected: false,
      woocommerceEvidence: [],
      wordpressDetected: false,
      wordpressEvidence: [],
      xmlRpcAccessible: false,
      xmlRpcEvidence: null,
    },
  };
}

test("processScanJob revalidates the safe target and completes HTTP header scanning", async () => {
  const scan = {
    id: "scan_1",
    scanType: "PROFESSIONAL",
    userId: "user_1",
    targetUrl: "example.com",
    normalizedUrl: "https://example.com",
    rootDomain: "example.com",
  };
  const { findings, logs, prisma, updates } = createMockPrisma(scan);
  const validatedUrls = [];
  const scannerInputs = [];
  const sslInputs = [];
  const emailInputs = [];
  const techInputs = [];

  const result = await processScanJob(
    {
      scanId: "scan_1",
      scanType: "PROFESSIONAL",
      userId: "user_1",
      targetUrl: "https://example.com",
    },
    {
      prisma,
      now: () => new Date("2026-05-13T00:00:00.000Z"),
      validateSafeTarget: async (url) => {
        validatedUrls.push(url);
      },
      httpHeadersScanner: async (input) => {
        scannerInputs.push(input);
        return createHeaderScanResult(input.scanId);
      },
      sslTlsScanner: async (input) => {
        sslInputs.push(input);
        return createSslScanResult(input.scanId);
      },
      emailSecurityScanner: async (input) => {
        emailInputs.push(input);
        return createEmailScanResult(input.scanId);
      },
      techDetectionScanner: async (input) => {
        techInputs.push(input);
        return createTechDetectionResult(input.scanId);
      },
    },
  );

  assert.deepEqual(validatedUrls, ["https://example.com"]);
  assert.deepEqual(scannerInputs, [
    {
      normalizedUrl: "https://example.com",
      scanId: "scan_1",
      targetUrl: "example.com",
    },
  ]);
  assert.deepEqual(sslInputs, [
    {
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "example.com",
    },
  ]);
  assert.deepEqual(emailInputs, [
    {
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "example.com",
    },
  ]);
  assert.deepEqual(techInputs, [
    {
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "example.com",
    },
  ]);
  assert.equal(result.status, "COMPLETED");
  assert.equal(findings.length, 4);
  assert.equal(findings[0].category, "HTTP Security Headers");
  assert.equal(findings[1].category, "SSL/TLS");
  assert.equal(findings[2].category, "Email Security");
  assert.equal(findings[3].category, "Technology Detection");
  assert.equal(updates[0].data.status, "RUNNING");
  assert.equal(updates.at(-1).data.status, "COMPLETED");
  assert.deepEqual(
    logs.map((log) => log.message),
    [
      "Scan job started",
      "Safe target validation passed",
      "HTTP headers scanner started",
      "Homepage response received with status code",
      "HTTP headers scanner completed",
      "Number of header findings created",
      "SSL/TLS scanner started",
      "SSL/TLS scanner completed",
      "Number of SSL/TLS findings created",
      "Email security scanner started",
      "Email security scanner completed",
      "Number of email security findings created",
      "Tech detection scanner started",
      "Tech detection scanner completed",
      "Number of technology detection findings created",
      "OWASP checklist builder started",
      "OWASP checklist builder completed",
      "Number of OWASP checklist items generated",
      "Remaining modules pending or checklist complete",
      "Risk scoring started",
      "Risk scoring completed",
      "Score and grade saved",
    ],
  );
  assert.equal(updates.at(-1).data.score, 73);
  assert.equal(updates.at(-1).data.grade, "C");
  assert.equal(
    logs.find((log) => log.message === "Number of OWASP checklist items generated")
      ?.metadata.checklistItemCount,
    10,
  );
  assert.equal(
    logs.find((log) => log.message === "Risk scoring completed")?.metadata
      .totalPenalty,
    27,
  );
});

test("processScanJob refuses mismatched scan owners before updates", async () => {
  const scan = {
    id: "scan_1",
    scanType: "PROFESSIONAL",
    userId: "user_1",
    targetUrl: "https://example.com",
    normalizedUrl: "https://example.com",
    rootDomain: "example.com",
  };
  const { logs, prisma, updates } = createMockPrisma(scan);

  await assert.rejects(
    () =>
      processScanJob(
        {
          scanId: "scan_1",
          scanType: "PROFESSIONAL",
          userId: "user_2",
          targetUrl: "https://example.com",
        },
        {
          prisma,
          validateSafeTarget: async () => undefined,
          httpHeadersScanner: async () => createHeaderScanResult(),
          emailSecurityScanner: async () => createEmailScanResult(),
          sslTlsScanner: async () => createSslScanResult(),
          techDetectionScanner: async () => createTechDetectionResult(),
        },
      ),
    ScanProcessingError,
  );

  assert.equal(updates.length, 0);
  assert.equal(logs.length, 0);
});

test("processScanJob skips OWASP checklist generation for BASIC scan type", async () => {
  const scan = {
    id: "scan_1",
    scanType: "BASIC",
    userId: "user_1",
    targetUrl: "example.com",
    normalizedUrl: "https://example.com",
    rootDomain: "example.com",
  };
  const { logs, prisma } = createMockPrisma(scan);

  await processScanJob(
    {
      scanId: "scan_1",
      scanType: "BASIC",
      userId: "user_1",
      targetUrl: "https://example.com",
    },
    {
      prisma,
      now: () => new Date("2026-05-13T00:00:00.000Z"),
      validateSafeTarget: async () => undefined,
      httpHeadersScanner: async () => createHeaderScanResult(),
      emailSecurityScanner: async () => createEmailScanResult(),
      sslTlsScanner: async () => createSslScanResult(),
      techDetectionScanner: async () => createTechDetectionResult(),
    },
  );

  const messages = logs.map((log) => log.message);

  assert.equal(messages.includes("OWASP checklist builder started"), false);
  assert.equal(messages.includes("OWASP checklist builder completed"), false);
  assert.equal(
    messages.includes("OWASP checklist is available in Professional Scan."),
    true,
  );
});

test("processScanJob replaces old scanner findings without duplicating Technology Detection findings when rerun", async () => {
  const scan = {
    id: "scan_1",
    scanType: "PROFESSIONAL",
    userId: "user_1",
    targetUrl: "example.com",
    normalizedUrl: "https://example.com",
    rootDomain: "example.com",
  };
  const { findings, prisma } = createMockPrisma(scan);
  const dependencies = {
    prisma,
    now: () => new Date("2026-05-13T00:00:00.000Z"),
    validateSafeTarget: async () => undefined,
    httpHeadersScanner: async () => createHeaderScanResult(),
    emailSecurityScanner: async () => createEmailScanResult(),
    sslTlsScanner: async () => createSslScanResult(),
    techDetectionScanner: async () => createTechDetectionResult(),
  };

  await processScanJob(
    {
      scanId: "scan_1",
      scanType: "PROFESSIONAL",
      userId: "user_1",
      targetUrl: "https://example.com",
    },
    dependencies,
  );
  await processScanJob(
    {
      scanId: "scan_1",
      scanType: "PROFESSIONAL",
      userId: "user_1",
      targetUrl: "https://example.com",
    },
    dependencies,
  );

  assert.equal(findings.length, 4);
  assert.equal(
    findings.filter((finding) => finding.category === "HTTP Security Headers")
      .length,
    1,
  );
  assert.equal(
    findings.filter((finding) => finding.category === "SSL/TLS").length,
    1,
  );
  assert.equal(
    findings.filter((finding) => finding.category === "Email Security").length,
    1,
  );
  assert.equal(
    findings.filter((finding) => finding.category === "Technology Detection")
      .length,
    1,
  );
  assert.equal(findings[0].title, "Missing Content-Security-Policy header");
  assert.equal(findings[1].title, "HTTP does not redirect to HTTPS");
  assert.equal(findings[2].title, "Missing SPF record");
  assert.equal(findings[3].title, "Server version exposed in response header");
});

test("failScanJob marks failed and writes an error log", async () => {
  const { logs, prisma, updates } = createMockPrisma(null);
  const now = new Date("2026-05-13T00:05:00.000Z");

  await failScanJob(
    prisma,
    "scan_1",
    new ScanProcessingError("Safe validation failed."),
    now,
  );

  assert.deepEqual(updates[0], {
    where: { id: "scan_1" },
    data: {
      status: "FAILED",
      completedAt: now,
      errorMessage: "Safe validation failed.",
    },
  });
  assert.equal(logs[0].level, "ERROR");
  assert.equal(logs[0].message, "Scan job failed: Safe validation failed.");
});
