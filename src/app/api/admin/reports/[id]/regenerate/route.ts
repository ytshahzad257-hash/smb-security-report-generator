import { NextResponse } from "next/server";

import { createAdminAuditLog, enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";
import { getPdfBrandingForUser } from "@/lib/agency/agencyProfile";
import { getPrisma } from "@/lib/prisma";
import { buildReportData } from "@/lib/reports/reportData";
import { generatePdfFromHtml } from "@/lib/reports/pdfGenerator";
import { renderReportHtml } from "@/lib/reports/reportHtml";
import { generateReportForScanWithDependencies } from "@/lib/reports/reportService";

export async function POST(request: Request, context: RouteContext<"/api/admin/reports/[id]/regenerate">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/reports/[id]/regenerate",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const prisma = getPrisma();
  const report = await prisma.report.findUnique({ where: { id } });

  if (!report) {
    return NextResponse.json({ error: "Report not found.", success: false }, { status: 404 });
  }

  try {
    const result = await generateReportForScanWithDependencies(report.scanId, report.userId, {
      buildData: buildReportData,
      canDownload: async () => true,
      createOrUpdate: async (args) => {
        const saved = await prisma.report.update({
          where: { id },
          data: {
            filePath: args.filePath,
            pdfUrl: args.pdfUrl,
            reportType: args.reportType,
            status: args.status,
            generatedAt: args.status === "GENERATED" ? new Date() : null,
          },
        });
        return { id: saved.id };
      },
      deductCredit: async () => ({ success: true, creditsRemaining: 0 }),
      generatePdf: generatePdfFromHtml,
      getBranding: getPdfBrandingForUser,
      getExisting: async () => null,
      renderHtml: (data, branding) => renderReportHtml(data, new Date(), branding),
    });

    await createAdminAuditLog({
      adminUserId: auth.user.id,
      action: "REPORT_REGENERATED_BY_ADMIN",
      targetUserId: report.userId,
      targetType: "Report",
      targetId: id,
    });

    return NextResponse.json({ ...result, success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Report could not be regenerated.", success: false }, { status: 400 });
  }
}
