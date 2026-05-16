import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { createAdminAuditLog, requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { REPORTS_PUBLIC_DIR } from "@/lib/reports/pdfGenerator";

function isPathInsideReportsDir(filePath: string) {
  const reportsDir = path.resolve(REPORTS_PUBLIC_DIR);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(reportsDir, resolvedPath);

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function GET(request: Request, context: RouteContext<"/api/admin/reports/[id]/download">) {
  const auth = await requireAdminApi(request);

  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrisma();
  const report = await prisma.report.findUnique({
    where: { id },
    include: { user: { select: { id: true } }, scan: { select: { rootDomain: true } } },
  });

  if (!report?.filePath || !isPathInsideReportsDir(report.filePath)) {
    return NextResponse.json({ error: "Report file is not available.", success: false }, { status: 404 });
  }

  try {
    await stat(report.filePath);
    const file = await readFile(report.filePath);
    const safeDomain = report.scan.rootDomain.replace(/[^a-zA-Z0-9.-]/g, "-");

    await createAdminAuditLog({
      adminUserId: auth.user.id,
      action: "REPORT_DOWNLOADED_BY_ADMIN",
      targetUserId: report.user.id,
      targetType: "Report",
      targetId: report.id,
    }).catch(() => undefined);

    return new Response(file, {
      headers: {
        "Content-Disposition": `attachment; filename="smb-security-report-${safeDomain}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return NextResponse.json({ error: "Report file is not available.", success: false }, { status: 404 });
  }
}
