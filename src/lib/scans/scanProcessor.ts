import type { ScanJobData } from "../queue/scanQueue";
import type {
  EmailSecurityFinding,
  EmailSecurityScannerLog,
  EmailSecuritySummary,
  ScanEmailSecurityInput,
  ScanEmailSecurityResult,
} from "../scanners/emailSecurityScanner.ts";
import { EMAIL_SECURITY_CATEGORY } from "../scanners/emailSecurityScanner.ts";
import type {
  HttpHeaderFinding,
  HeaderSummaryItem,
  ScanHttpSecurityHeadersInput,
  ScanHttpSecurityHeadersResult,
} from "../scanners/httpHeadersScanner.ts";
import { HTTP_SECURITY_HEADERS_CATEGORY } from "../scanners/httpHeadersScanner.ts";
import type {
  BuildOwaspChecklistInput,
  BuildOwaspChecklistOutput,
} from "../scanners/owaspChecklistBuilder.ts";
import { OWASP_CHECKLIST_LOG_METADATA_KEY } from "../scanners/owaspChecklistBuilder.ts";
import type {
  ScanSslTlsInput,
  ScanSslTlsResult,
  SslTlsFinding,
  SslTlsSummary,
} from "../scanners/sslTlsScanner.ts";
import { SSL_TLS_CATEGORY } from "../scanners/sslTlsScanner.ts";
import type {
  ScanTechDetectionInput,
  ScanTechDetectionResult,
  TechDetectionFinding,
  TechDetectionScannerLog,
  TechDetectionSummary,
} from "../scanners/techDetectionScanner.ts";
import { TECH_DETECTION_CATEGORY } from "../scanners/techDetectionScanner.ts";
import {
  buildPriorityFixList,
  buildScoreExplanation,
  calculateCategoryScores,
  calculateGrade,
  calculateRiskScore,
  calculateSeverityCounts,
} from "../security/scoringEngine.ts";
import {
  createCompletedScanUpdate,
  createFailedScanUpdate,
  createRunningScanUpdate,
  getSafeScanErrorMessage,
  ScanProcessingError,
  shouldMarkScanFailed,
} from "./scanLifecycle.ts";

type ScanLogLevel = "INFO" | "WARN" | "ERROR";

type ScanRecord = {
  id: string;
  scanType: string;
  userId: string;
  targetUrl: string;
  normalizedUrl: string;
  rootDomain: string;
};

type ScanUpdateData =
  | ReturnType<typeof createRunningScanUpdate>
  | ReturnType<typeof createCompletedScanUpdate>
  | ReturnType<typeof createFailedScanUpdate>;

type ScanLogMetadata = Record<string, unknown>;
type ScannerFinding =
  | EmailSecurityFinding
  | HttpHeaderFinding
  | SslTlsFinding
  | TechDetectionFinding;
type PersistedFinding = ScannerFinding & { id?: string };

export type ScanProcessorPrisma = {
  scan: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        scanType: true;
        userId: true;
        targetUrl: true;
        normalizedUrl: true;
        rootDomain: true;
      };
    }) => Promise<ScanRecord | null>;
    update: (args: {
      where: { id: string };
      data: ScanUpdateData;
    }) => Promise<unknown>;
  };
  scanLog: {
    create: (args: {
      data: {
        scanId: string;
        level: ScanLogLevel;
        message: string;
        metadata?: ScanLogMetadata;
      };
    }) => Promise<unknown>;
    deleteMany?: (args: {
      where: {
        scanId: string;
        message: {
          in: string[];
        };
      };
    }) => Promise<unknown>;
  };
  finding: {
    createMany: (args: { data: ScannerFinding[] }) => Promise<unknown>;
    deleteMany: (args: {
      where: {
        category:
          | typeof EMAIL_SECURITY_CATEGORY
          | typeof HTTP_SECURITY_HEADERS_CATEGORY
          | typeof SSL_TLS_CATEGORY
          | typeof TECH_DETECTION_CATEGORY;
        scanId: string;
      };
    }) => Promise<unknown>;
  };
};

type ProcessScanJobDependencies = {
  prisma?: ScanProcessorPrisma;
  now?: () => Date;
  validateSafeTarget?: (url: string) => Promise<unknown>;
  httpHeadersScanner?: (
    input: ScanHttpSecurityHeadersInput,
  ) => Promise<ScanHttpSecurityHeadersResult>;
  emailSecurityScanner?: (
    input: ScanEmailSecurityInput,
  ) => Promise<ScanEmailSecurityResult>;
  sslTlsScanner?: (input: ScanSslTlsInput) => Promise<ScanSslTlsResult>;
  techDetectionScanner?: (
    input: ScanTechDetectionInput,
  ) => Promise<ScanTechDetectionResult>;
  owaspChecklistBuilder?: (
    input: BuildOwaspChecklistInput,
  ) => BuildOwaspChecklistOutput;
  notifyScanCompleted?: (scanId: string) => Promise<void>;
};

async function getDefaultPrisma() {
  const { getPrisma } = await import("../prisma");

  return getPrisma() as unknown as ScanProcessorPrisma;
}

async function getDefaultValidateSafeTarget() {
  const { checkRedirectSafety } = await import("../security/urlSafety");

  return checkRedirectSafety;
}

async function getDefaultHttpHeadersScanner() {
  const { scanHttpSecurityHeaders } = await import(
    "../scanners/httpHeadersScanner.ts"
  );

  return scanHttpSecurityHeaders;
}

async function getDefaultEmailSecurityScanner() {
  const { scanEmailSecurity } = await import(
    "../scanners/emailSecurityScanner.ts"
  );

  return scanEmailSecurity;
}

async function getDefaultSslTlsScanner() {
  const { scanSslTls } = await import("../scanners/sslTlsScanner.ts");

  return scanSslTls;
}

async function getDefaultTechDetectionScanner() {
  const { scanTechDetection } = await import(
    "../scanners/techDetectionScanner.ts"
  );

  return scanTechDetection;
}

async function getDefaultOwaspChecklistBuilder() {
  const { buildOwaspChecklist } = await import(
    "../scanners/owaspChecklistBuilder.ts"
  );

  return buildOwaspChecklist;
}

async function getDefaultScanCompletedNotifier() {
  const { notifyScanCompleted } = await import("../email/notifications.ts");

  return notifyScanCompleted;
}

async function addScanLog(
  prisma: ScanProcessorPrisma,
  scanId: string,
  level: ScanLogLevel,
  message: string,
  metadata?: ScanLogMetadata,
) {
  await prisma.scanLog.create({
    data: {
      scanId,
      level,
      message,
      metadata,
    },
  });
}

export async function failScanJob(
  prisma: ScanProcessorPrisma,
  scanId: string,
  error: unknown,
  now = new Date(),
) {
  const failedUpdate = createFailedScanUpdate(error, now);

  await prisma.scan.update({
    where: { id: scanId },
    data: failedUpdate,
  });

  await addScanLog(prisma, scanId, "ERROR", `Scan job failed: ${failedUpdate.errorMessage}`);

  return failedUpdate;
}

function serializeHeaderSummary(headerSummary: HeaderSummaryItem[]) {
  return headerSummary.map((header) => ({
    findingTitles: header.findingTitles,
    name: header.name,
    note: header.note ?? null,
    status: header.status,
  }));
}

function serializeEmailSecuritySummary(emailSecuritySummary: EmailSecuritySummary) {
  return {
    checkedAt: emailSecuritySummary.checkedAt,
    dkimErrorCount: emailSecuritySummary.dkimErrorCount,
    dkimSelectorsFound: emailSecuritySummary.dkimSelectorsFound,
    dkimSelectorsTested: emailSecuritySummary.dkimSelectorsTested,
    dmarcError: emailSecuritySummary.dmarcError,
    dmarcFound: emailSecuritySummary.dmarcFound,
    dmarcPolicy: emailSecuritySummary.dmarcPolicy,
    dmarcRecord: emailSecuritySummary.dmarcRecord,
    domain: emailSecuritySummary.domain,
    mxError: emailSecuritySummary.mxError,
    mxFound: emailSecuritySummary.mxFound,
    mxRecords: emailSecuritySummary.mxRecords,
    spfAssessment: emailSecuritySummary.spfAssessment,
    spfError: emailSecuritySummary.spfError,
    spfFound: emailSecuritySummary.spfFound,
    spfRecord: emailSecuritySummary.spfRecord,
  };
}

function serializeSslSummary(sslSummary: SslTlsSummary) {
  return {
    authorizationError: sslSummary.authorizationError,
    certificateExists: sslSummary.certificateExists,
    certificateValid: sslSummary.certificateValid,
    checkedAt: sslSummary.checkedAt,
    daysUntilExpiry: sslSummary.daysUntilExpiry,
    expired: sslSummary.expired,
    hostnameMatched: sslSummary.hostnameMatched,
    httpRedirectFinalUrl: sslSummary.httpRedirectFinalUrl,
    httpRedirectsToHttps: sslSummary.httpRedirectsToHttps,
    httpRedirectStatusCode: sslSummary.httpRedirectStatusCode,
    httpsAvailable: sslSummary.httpsAvailable,
    httpsError: sslSummary.httpsError,
    issuer: sslSummary.issuer,
    subject: sslSummary.subject,
    subjectAltNames: sslSummary.subjectAltNames,
    validFrom: sslSummary.validFrom,
    validTo: sslSummary.validTo,
  };
}

function serializeTechDetectionSummary(techSummary: TechDetectionSummary) {
  return {
    checkedAt: techSummary.checkedAt,
    exposedPathChecks: techSummary.exposedPathChecks.map((check) => ({
      confidence: check.confidence,
      error: check.error,
      evidence: check.evidence,
      findingTitle: check.findingTitle,
      path: check.path,
      status: check.status,
      statusCode: check.statusCode,
      url: check.url,
    })),
    homepageFinalUrl: techSummary.homepageFinalUrl,
    homepageStatusCode: techSummary.homepageStatusCode,
    serverHeader: techSummary.serverHeader,
    technologiesDetected: techSummary.technologiesDetected,
    woocommerceDetected: techSummary.woocommerceDetected,
    woocommerceEvidence: techSummary.woocommerceEvidence,
    wordpressDetected: techSummary.wordpressDetected,
    wordpressEvidence: techSummary.wordpressEvidence,
    xmlRpcAccessible: techSummary.xmlRpcAccessible,
    xmlRpcEvidence: techSummary.xmlRpcEvidence,
  };
}

async function replaceHttpHeaderFindings(
  prisma: ScanProcessorPrisma,
  scanId: string,
  findings: HttpHeaderFinding[],
) {
  await prisma.finding.deleteMany({
    where: {
      category: HTTP_SECURITY_HEADERS_CATEGORY,
      scanId,
    },
  });

  if (findings.length === 0) {
    return;
  }

  await prisma.finding.createMany({
    data: findings,
  });
}

async function refreshOwaspChecklistLogs(prisma: ScanProcessorPrisma, scanId: string) {
  if (!prisma.scanLog.deleteMany) {
    return;
  }

  await prisma.scanLog.deleteMany({
    where: {
      message: {
        in: [
          "OWASP checklist builder started",
          "OWASP checklist builder completed",
          "Number of OWASP checklist items generated",
        ],
      },
      scanId,
    },
  });
}

async function replaceSslTlsFindings(
  prisma: ScanProcessorPrisma,
  scanId: string,
  findings: SslTlsFinding[],
) {
  await prisma.finding.deleteMany({
    where: {
      category: SSL_TLS_CATEGORY,
      scanId,
    },
  });

  if (findings.length === 0) {
    return;
  }

  await prisma.finding.createMany({
    data: findings,
  });
}

async function replaceEmailSecurityFindings(
  prisma: ScanProcessorPrisma,
  scanId: string,
  findings: EmailSecurityFinding[],
) {
  await prisma.finding.deleteMany({
    where: {
      category: EMAIL_SECURITY_CATEGORY,
      scanId,
    },
  });

  if (findings.length === 0) {
    return;
  }

  await prisma.finding.createMany({
    data: findings,
  });
}

async function addScannerLogs(
  prisma: ScanProcessorPrisma,
  scanId: string,
  logs: Array<EmailSecurityScannerLog | TechDetectionScannerLog>,
) {
  for (const log of logs) {
    await addScanLog(prisma, scanId, log.level, log.message, log.metadata);
  }
}

async function replaceTechDetectionFindings(
  prisma: ScanProcessorPrisma,
  scanId: string,
  findings: TechDetectionFinding[],
) {
  await prisma.finding.deleteMany({
    where: {
      category: TECH_DETECTION_CATEGORY,
      scanId,
    },
  });

  if (findings.length === 0) {
    return;
  }

  await prisma.finding.createMany({
    data: findings,
  });
}

export async function processScanJob(
  data: ScanJobData,
  dependencies: ProcessScanJobDependencies = {},
) {
  const prisma = dependencies.prisma ?? (await getDefaultPrisma());
  const now = dependencies.now ?? (() => new Date());
  const validateSafeTarget =
    dependencies.validateSafeTarget ?? (await getDefaultValidateSafeTarget());
  const httpHeadersScanner =
    dependencies.httpHeadersScanner ?? (await getDefaultHttpHeadersScanner());
  const sslTlsScanner =
    dependencies.sslTlsScanner ?? (await getDefaultSslTlsScanner());
  const emailSecurityScanner =
    dependencies.emailSecurityScanner ?? (await getDefaultEmailSecurityScanner());
  const techDetectionScanner =
    dependencies.techDetectionScanner ?? (await getDefaultTechDetectionScanner());
  const owaspChecklistBuilder =
    dependencies.owaspChecklistBuilder ??
    (await getDefaultOwaspChecklistBuilder());
  const notifyScanCompleted =
    dependencies.notifyScanCompleted ??
    (dependencies.prisma ? undefined : await getDefaultScanCompletedNotifier());
  let scanIdForFailure: string | null = null;

  try {
    const scan = await prisma.scan.findUnique({
      where: { id: data.scanId },
      select: {
        id: true,
        scanType: true,
        userId: true,
        targetUrl: true,
        normalizedUrl: true,
        rootDomain: true,
      },
    });

    if (!scan) {
      throw new ScanProcessingError("Scan record was not found.", {
        markScanFailed: false,
      });
    }

    if (scan.userId !== data.userId) {
      throw new ScanProcessingError("Scan job does not match the scan owner.", {
        markScanFailed: false,
      });
    }

    scanIdForFailure = scan.id;

    await prisma.scan.update({
      where: { id: scan.id },
      data: createRunningScanUpdate(now()),
    });

    await addScanLog(prisma, scan.id, "INFO", "Scan job started", {
      queuedTargetUrl: data.targetUrl,
      queuedScanType: data.scanType,
      storedScanType: scan.scanType,
    });
    const scanType = scan.scanType === "BASIC" ? "BASIC" : "PROFESSIONAL";

    if (scanType !== data.scanType) {
      await addScanLog(
        prisma,
        scan.id,
        "WARN",
        "Queued scan type did not match stored scan type. Using stored value.",
      );
    }

    const safeTargetUrl = scan.normalizedUrl || data.targetUrl;
    const completedModules = {
      emailSecurity: false,
      httpHeaders: false,
      sslTls: false,
      techDetection: false,
    };
    const completedFindings: PersistedFinding[] = [];

    await validateSafeTarget(safeTargetUrl);
    await addScanLog(prisma, scan.id, "INFO", "Safe target validation passed");

    await addScanLog(prisma, scan.id, "INFO", "HTTP headers scanner started");
    const headerScanResult = await httpHeadersScanner({
      normalizedUrl: safeTargetUrl,
      scanId: scan.id,
      targetUrl: scan.targetUrl,
    });

    await addScanLog(
      prisma,
      scan.id,
      "INFO",
      "Homepage response received with status code",
      {
        finalUrl: headerScanResult.finalUrl,
        redirectsFollowed: headerScanResult.redirectsFollowed,
        statusCode: headerScanResult.statusCode,
      },
    );

    await replaceHttpHeaderFindings(
      prisma,
      scan.id,
      headerScanResult.findings,
    );
    completedFindings.push(...headerScanResult.findings);
    completedModules.httpHeaders = true;

    await addScanLog(prisma, scan.id, "INFO", "HTTP headers scanner completed", {
      finalUrl: headerScanResult.finalUrl,
      headerSummary: serializeHeaderSummary(headerScanResult.headerSummary),
      redirectsFollowed: headerScanResult.redirectsFollowed,
      statusCode: headerScanResult.statusCode,
    });
    await addScanLog(
      prisma,
      scan.id,
      "INFO",
      "Number of header findings created",
      {
        findingCount: headerScanResult.findings.length,
      },
    );

    await addScanLog(prisma, scan.id, "INFO", "SSL/TLS scanner started");

    try {
      const sslTlsResult = await sslTlsScanner({
        normalizedUrl: safeTargetUrl,
        rootDomain: scan.rootDomain,
        scanId: scan.id,
        targetUrl: scan.targetUrl,
      });

      await replaceSslTlsFindings(prisma, scan.id, sslTlsResult.findings);
      completedFindings.push(...sslTlsResult.findings);
      completedModules.sslTls = true;

      await addScanLog(prisma, scan.id, "INFO", "SSL/TLS scanner completed", {
        sslSummary: serializeSslSummary(sslTlsResult.sslSummary),
      });
      await addScanLog(
        prisma,
        scan.id,
        "INFO",
        "Number of SSL/TLS findings created",
        {
          findingCount: sslTlsResult.findings.length,
        },
      );
    } catch (error) {
      await addScanLog(
        prisma,
        scan.id,
        "ERROR",
        `SSL/TLS scanner failed: ${getSafeScanErrorMessage(error)}`,
      );
      throw error;
    }

    await addScanLog(prisma, scan.id, "INFO", "Email security scanner started");

    try {
      const emailSecurityResult = await emailSecurityScanner({
        normalizedUrl: safeTargetUrl,
        rootDomain: scan.rootDomain,
        scanId: scan.id,
        targetUrl: scan.targetUrl,
      });

      await addScannerLogs(prisma, scan.id, emailSecurityResult.logs);
      await replaceEmailSecurityFindings(
        prisma,
        scan.id,
        emailSecurityResult.findings,
      );
      completedFindings.push(...emailSecurityResult.findings);
      completedModules.emailSecurity = true;

      await addScanLog(prisma, scan.id, "INFO", "Email security scanner completed", {
        emailSecuritySummary: serializeEmailSecuritySummary(
          emailSecurityResult.emailSecuritySummary,
        ),
      });
      await addScanLog(
        prisma,
        scan.id,
        "INFO",
        "Number of email security findings created",
        {
          findingCount: emailSecurityResult.findings.length,
        },
      );
    } catch (error) {
      await addScanLog(
        prisma,
        scan.id,
        "ERROR",
        `Email security scanner failed: ${getSafeScanErrorMessage(error)}`,
      );
    }

    await addScanLog(prisma, scan.id, "INFO", "Tech detection scanner started");

    try {
      const techDetectionResult = await techDetectionScanner({
        normalizedUrl: safeTargetUrl,
        rootDomain: scan.rootDomain,
        scanId: scan.id,
        targetUrl: scan.targetUrl,
      });

      await addScannerLogs(prisma, scan.id, techDetectionResult.logs);
      await replaceTechDetectionFindings(
        prisma,
        scan.id,
        techDetectionResult.findings,
      );
      completedFindings.push(...techDetectionResult.findings);
      completedModules.techDetection = true;

      await addScanLog(prisma, scan.id, "INFO", "Tech detection scanner completed", {
        techDetectionSummary: serializeTechDetectionSummary(
          techDetectionResult.techSummary,
        ),
      });
      await addScanLog(
        prisma,
        scan.id,
        "INFO",
        "Number of technology detection findings created",
        {
          findingCount: techDetectionResult.findings.length,
        },
      );
    } catch (error) {
      await addScanLog(
        prisma,
        scan.id,
        "ERROR",
        `Tech detection scanner failed: ${getSafeScanErrorMessage(error)}`,
      );
    }

    if (scanType === "PROFESSIONAL") {
      await refreshOwaspChecklistLogs(prisma, scan.id);
      await addScanLog(prisma, scan.id, "INFO", "OWASP checklist builder started");
      const owaspChecklistResult = owaspChecklistBuilder({
        completedModules,
        findings: completedFindings,
        scanId: scan.id,
      });
      await addScanLog(prisma, scan.id, "INFO", "OWASP checklist builder completed", {
        [OWASP_CHECKLIST_LOG_METADATA_KEY]: {
          checklistItems: owaspChecklistResult.checklistItems,
          generatedAt: now().toISOString(),
          remediationSummary: owaspChecklistResult.remediationSummary,
          wording: "OWASP-aligned posture checklist",
        },
      });
      await addScanLog(
        prisma,
        scan.id,
        "INFO",
        "Number of OWASP checklist items generated",
        {
          checklistItemCount: owaspChecklistResult.checklistItems.length,
        },
      );
    } else {
      await refreshOwaspChecklistLogs(prisma, scan.id);
      await addScanLog(
        prisma,
        scan.id,
        "INFO",
        "OWASP checklist is available in Professional Scan.",
      );
    }

    await addScanLog(prisma, scan.id, "INFO", "Remaining modules pending or checklist complete", {
      completedModules,
      pendingModules:
        scanType === "PROFESSIONAL"
          ? ["PDF Reports"]
          : ["OWASP Checklist", "Priority Remediation Summary", "PDF Reports"],
      scanType,
    });

    await addScanLog(prisma, scan.id, "INFO", "Risk scoring started");
    const score = calculateRiskScore(completedFindings);
    const grade = calculateGrade(score);
    const severityCounts = calculateSeverityCounts(completedFindings);
    const categoryScores = calculateCategoryScores(completedFindings);
    const explanation = buildScoreExplanation(completedFindings, score, grade);
    const priorityFixes = buildPriorityFixList(completedFindings);

    await addScanLog(prisma, scan.id, "INFO", "Risk scoring completed", {
      categoryScores,
      explanation,
      priorityFixes,
      score,
      severityCounts,
      totalPenalty: explanation.totalPenalty,
    });

    await prisma.scan.update({
      where: { id: scan.id },
      data: createCompletedScanUpdate(now(), { grade, score }),
    });

    await addScanLog(prisma, scan.id, "INFO", "Score and grade saved", {
      categoryScores,
      explanation,
      grade,
      score,
      severityCounts,
      totalPenalty: explanation.totalPenalty,
    });
    await notifyScanCompleted?.(scan.id).catch(() => undefined);

    return {
      scanId: scan.id,
      status: "COMPLETED" as const,
    };
  } catch (error) {
    if (scanIdForFailure && shouldMarkScanFailed(error)) {
      await failScanJob(prisma, scanIdForFailure, error, now());
    }

    throw error;
  }
}
