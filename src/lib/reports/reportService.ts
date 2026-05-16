import { unlink } from "fs/promises";

import {
  buildReportData,
  ReportGenerationError,
  type ReportData,
} from "./reportData.ts";
import { renderReportHtml } from "./reportHtml.ts";
import type { ReportBranding } from "./reportHtml.ts";
import {
  generatePdfFromHtml,
  getReportPublicUrl,
  getReportStoragePath,
} from "./pdfGenerator.ts";

export type GenerateReportResult = {
  reportId: string;
  downloadUrl: string;
};

type GeneratedReportType = "BASIC" | "PROFESSIONAL" | "WHITE_LABEL";
type ResolvedScanType = "BASIC" | "PROFESSIONAL";

type ExistingReport = {
  id: string;
  pdfUrl: string | null;
};

type SavedReport = {
  id: string;
};

type FinalizedReportResult = {
  reportId: string;
  charged: boolean;
};

type PdfEntitlementCheckResult = {
  allowed: boolean;
  reason?: string;
  planId?: string;
  planName?: string;
  planSlug?: string;
};

type GenerateReportDependencies = {
  buildData: (scanId: string, userId: string) => Promise<ReportData>;
  canDownload: (userId: string) => Promise<boolean>;
  checkPdfEntitlement?: (
    userId: string,
    scanType: ResolvedScanType,
  ) => Promise<PdfEntitlementCheckResult>;
  logEntitlementBlock?: (input: {
    userId: string;
    scanId: string;
    scanType: ResolvedScanType;
    reason: string;
    planId?: string;
    planName?: string;
    planSlug?: string;
  }) => Promise<void>;
  createOrUpdate: (args: {
    scanId: string;
    userId: string;
    filePath: string | null;
    pdfUrl: string | null;
    reportType: GeneratedReportType;
    status: "GENERATED" | "FAILED";
  }) => Promise<SavedReport>;
  deductCredit: (
    userId: string,
    reportId?: string,
  ) => Promise<{ success: boolean; creditsRemaining: number }>;
  finalizeGeneratedReport?: (args: {
    scanId: string;
    userId: string;
    filePath: string;
    pdfUrl: string;
    reportType: GeneratedReportType;
  }) => Promise<FinalizedReportResult>;
  generatePdf: (html: string, outputPath: string) => Promise<void>;
  getBranding: (userId: string) => Promise<{
    branding: ReportBranding | null;
    reportType: "PROFESSIONAL" | "WHITE_LABEL";
  }>;
  getExisting: (scanId: string, userId: string) => Promise<ExistingReport | null>;
  notifyGenerated?: (reportId: string) => Promise<void>;
  notifyGenerationFailed?: (input: {
    error: unknown;
    scanId: string;
    userId: string;
  }) => Promise<void>;
  renderHtml: (data: ReportData, branding: ReportBranding | null) => string;
};

function resolveScanType(scanType: unknown): ResolvedScanType {
  if (typeof scanType === "string" && scanType.toUpperCase() === "BASIC") {
    return "BASIC";
  }

  // Safe fallback for legacy/invalid scan types:
  // keep historical behavior by treating unknown as PROFESSIONAL.
  return "PROFESSIONAL";
}

function getPdfPlanBlockedMessage(scanType: ResolvedScanType) {
  return scanType === "BASIC"
    ? "Your current plan does not include Basic PDF reports."
    : "Your current plan does not include Professional PDF reports.";
}

async function getExistingGeneratedReport(scanId: string, userId: string) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();

  return prisma.report.findFirst({
    where: {
      scanId,
      userId,
      status: "GENERATED",
      pdfUrl: {
        not: null,
      },
    },
    orderBy: {
      generatedAt: "desc",
    },
  });
}

async function createOrUpdateReport(args: {
  scanId: string;
  userId: string;
  filePath: string | null;
  pdfUrl: string | null;
  reportType: GeneratedReportType;
  status: "GENERATED" | "FAILED";
}) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const [existing, scan] = await Promise.all([
    prisma.report.findFirst({
      where: {
        scanId: args.scanId,
        userId: args.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.scan.findFirst({
      where: {
        id: args.scanId,
        userId: args.userId,
      },
      select: {
        clientId: true,
        clientName: true,
      },
    }),
  ]);

  const data = {
    clientId: scan?.clientId ?? null,
    clientName: scan?.clientName ?? null,
    filePath: args.filePath,
    generatedAt: args.status === "GENERATED" ? new Date() : null,
    pdfUrl: args.pdfUrl,
    reportType: args.reportType,
    status: args.status,
  };

  if (existing) {
    return prisma.report.update({
      data,
      where: {
        id: existing.id,
      },
    });
  }

  return prisma.report.create({
    data: {
      ...data,
      scanId: args.scanId,
      userId: args.userId,
    },
  });
}

async function finalizeReportAndDeductCredit(args: {
  scanId: string;
  userId: string;
  filePath: string;
  pdfUrl: string;
  reportType: GeneratedReportType;
}): Promise<FinalizedReportResult> {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const [existingGeneratedReport, latestReport, scan, activeSubscription] =
      await Promise.all([
        tx.report.findFirst({
          where: {
            scanId: args.scanId,
            userId: args.userId,
            status: "GENERATED",
            pdfUrl: {
              not: null,
            },
          },
          orderBy: {
            generatedAt: "desc",
          },
          select: {
            id: true,
            pdfUrl: true,
          },
        }),
        tx.report.findFirst({
          where: {
            scanId: args.scanId,
            userId: args.userId,
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
          },
        }),
        tx.scan.findFirst({
          where: {
            id: args.scanId,
            userId: args.userId,
          },
          select: {
            clientId: true,
            clientName: true,
          },
        }),
        tx.subscription.findFirst({
          where: {
            userId: args.userId,
            status: "ACTIVE",
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            creditsRemaining: true,
            id: true,
          },
        }),
      ]);

    if (existingGeneratedReport?.pdfUrl) {
      return {
        charged: false,
        reportId: existingGeneratedReport.id,
      };
    }

    if (!activeSubscription || activeSubscription.creditsRemaining <= 0) {
      throw new ReportGenerationError("No report credits available.", "NO_CREDITS");
    }

    const data = {
      clientId: scan?.clientId ?? null,
      clientName: scan?.clientName ?? null,
      filePath: args.filePath,
      generatedAt: new Date(),
      pdfUrl: args.pdfUrl,
      reportType: args.reportType,
      status: "GENERATED" as const,
    };

    const report = latestReport
      ? await tx.report.update({
          data,
          where: {
            id: latestReport.id,
          },
        })
      : await tx.report.create({
          data: {
            ...data,
            scanId: args.scanId,
            userId: args.userId,
          },
        });

    const creditUpdate = await tx.subscription.updateMany({
      where: {
        id: activeSubscription.id,
        userId: args.userId,
        status: "ACTIVE",
        creditsRemaining: {
          gt: 0,
        },
      },
      data: {
        creditsUsed: {
          increment: 1,
        },
        creditsRemaining: {
          decrement: 1,
        },
      },
    });

    if (creditUpdate.count === 0) {
      throw new ReportGenerationError("No report credits available.", "NO_CREDITS");
    }

    return {
      charged: true,
      reportId: report.id,
    };
  });
}

async function cleanupGeneratedPdfIfNoSavedReport(args: {
  dependencies: GenerateReportDependencies;
  filePath: string;
  scanId: string;
  userId: string;
}) {
  try {
    const existingReport = await args.dependencies.getExisting(args.scanId, args.userId);

    if (existingReport?.pdfUrl) {
      return;
    }

    await unlink(args.filePath);
  } catch {
    return;
  }
}

function getDefaultDependencies(): GenerateReportDependencies {
  return {
    buildData: buildReportData,
    canDownload: async (userId) => {
      const { hasReportCredit } = await import("../billing.ts");

      return hasReportCredit(userId);
    },
    checkPdfEntitlement: async (userId, scanType) => {
      const { canGeneratePdf, getPlanEntitlementsForUser } = await import(
        "../billing/planEntitlements.ts"
      );
      const [entitlements, access] = await Promise.all([
        getPlanEntitlementsForUser(userId),
        canGeneratePdf(userId, scanType),
      ]);

      return {
        allowed: access.allowed,
        planId: entitlements.planId,
        planName: entitlements.planName,
        planSlug: entitlements.planSlug,
        reason: access.reason,
      };
    },
    logEntitlementBlock: async (input) => {
      const { logAbuseEvent } = await import("../security/abuseLog.ts");

      await logAbuseEvent({
        eventType: "PLAN_PDF_ACCESS_BLOCKED",
        metadata: {
          planId: input.planId ?? null,
          planName: input.planName ?? null,
          planSlug: input.planSlug ?? null,
          reason: input.reason,
          scanId: input.scanId,
          scanType: input.scanType,
        },
        reason: input.reason,
        severity: "INFO",
        target: input.scanId,
        userId: input.userId,
      });
    },
    createOrUpdate: createOrUpdateReport,
    deductCredit: async (userId, reportId) => {
      const { deductReportCredit } = await import("../billing.ts");

      return deductReportCredit(userId, reportId);
    },
    finalizeGeneratedReport: finalizeReportAndDeductCredit,
    generatePdf: generatePdfFromHtml,
    getBranding: async (userId) => {
      const { getPdfBrandingForUser } = await import("../agency/agencyProfile.ts");

      return getPdfBrandingForUser(userId);
    },
    getExisting: getExistingGeneratedReport,
    notifyGenerated: async (reportId) => {
      const { notifyPdfReportGenerated } = await import("../email/notifications.ts");

      await notifyPdfReportGenerated(reportId);
    },
    notifyGenerationFailed: async (input) => {
      const { notifyPdfGenerationFailed } = await import("../email/notifications.ts");

      await notifyPdfGenerationFailed(input);
    },
    renderHtml: (data, branding) => renderReportHtml(data, new Date(), branding),
  };
}

export async function generateReportForScanWithDependencies(
  scanId: string,
  userId: string,
  dependencies: GenerateReportDependencies,
): Promise<GenerateReportResult> {
  const existingReport = await dependencies.getExisting(scanId, userId);

  if (existingReport?.pdfUrl) {
    return {
      downloadUrl: `/api/reports/${existingReport.id}/download`,
      reportId: existingReport.id,
    };
  }

  const data = await dependencies.buildData(scanId, userId);
  const scanType = resolveScanType(data.scan.scanType);
  const entitlementResult = dependencies.checkPdfEntitlement
    ? await dependencies.checkPdfEntitlement(userId, scanType)
    : { allowed: true };

  if (!entitlementResult.allowed) {
    const reason = entitlementResult.reason ?? getPdfPlanBlockedMessage(scanType);
    await dependencies
      .logEntitlementBlock?.({
        planId: entitlementResult.planId,
        planName: entitlementResult.planName,
        planSlug: entitlementResult.planSlug,
        reason,
        scanId,
        scanType,
        userId,
      })
      .catch(() => undefined);

    throw new ReportGenerationError(reason, "PLAN_ACCESS_DENIED");
  }

  const hasAccess = await dependencies.canDownload(userId);

  if (!hasAccess) {
    throw new ReportGenerationError(
      "No report credits available.",
      "NO_CREDITS",
    );
  }

  const filePath = getReportStoragePath(scanId);
  const pdfUrl = getReportPublicUrl(scanId);
  const isBasicScan = data.scan.scanType === "BASIC";
  const branding = isBasicScan
    ? { branding: null, reportType: "BASIC" as const }
    : await dependencies.getBranding(userId);
  let pdfGenerated = false;

  try {
    const html = dependencies.renderHtml(data, branding.branding);

    await dependencies.generatePdf(html, filePath);
    pdfGenerated = true;
    const finalized = dependencies.finalizeGeneratedReport
      ? await dependencies.finalizeGeneratedReport({
          filePath,
          pdfUrl,
          reportType: branding.reportType,
          scanId,
          userId,
        })
      : await (async () => {
          const report = await dependencies.createOrUpdate({
            filePath,
            pdfUrl,
            reportType: branding.reportType,
            scanId,
            status: "GENERATED",
            userId,
          });
          const credit = await dependencies.deductCredit(userId, report.id);

          if (!credit.success) {
            throw new ReportGenerationError(
              "No report credits available.",
              "NO_CREDITS",
            );
          }

          return {
            charged: true,
            reportId: report.id,
          };
        })();

    if (finalized.charged) {
      await dependencies.notifyGenerated?.(finalized.reportId).catch(() => undefined);
    }

    return {
      downloadUrl: `/api/reports/${finalized.reportId}/download`,
      reportId: finalized.reportId,
    };
  } catch (error) {
    if (error instanceof ReportGenerationError) {
      if (pdfGenerated && dependencies.finalizeGeneratedReport) {
        await cleanupGeneratedPdfIfNoSavedReport({
          dependencies,
          filePath,
          scanId,
          userId,
        });
      }

      throw error;
    }

    if (pdfGenerated && dependencies.finalizeGeneratedReport) {
      await cleanupGeneratedPdfIfNoSavedReport({
        dependencies,
        filePath,
        scanId,
        userId,
      });
    }

    await dependencies.createOrUpdate({
      filePath: null,
      pdfUrl: null,
      reportType: branding.reportType,
      scanId,
      status: "FAILED",
      userId,
    });
    await dependencies.notifyGenerationFailed?.({ error, scanId, userId }).catch(
      () => undefined,
    );

    throw new ReportGenerationError("PDF generation failed. No report credit was deducted.", "PDF_FAILED");
  }
}

export async function generateReportForScan(
  scanId: string,
  userId: string,
): Promise<GenerateReportResult> {
  return generateReportForScanWithDependencies(scanId, userId, getDefaultDependencies());
}
