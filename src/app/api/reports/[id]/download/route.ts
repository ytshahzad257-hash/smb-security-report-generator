import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { REPORTS_PUBLIC_DIR } from "@/lib/reports/pdfGenerator";

function isPathInsideReportsDir(filePath: string) {
  const reportsDir = path.resolve(REPORTS_PUBLIC_DIR);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(reportsDir, resolvedPath);

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function GET(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const { id } = await segmentData.params;
  const prisma = getPrisma();
  const report = await prisma.report.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      scan: {
        select: {
          id: true,
          rootDomain: true,
        },
      },
    },
  });

  if (!report || report.status !== "GENERATED" || !report.filePath) {
    return NextResponse.json(
      { error: "Report was not found.", success: false },
      { status: 404 },
    );
  }

  if (!isPathInsideReportsDir(report.filePath)) {
    return NextResponse.json(
      { error: "Report file is not available.", success: false },
      { status: 404 },
    );
  }

  try {
    await stat(report.filePath);
    const file = await readFile(report.filePath);
    const safeDomain = report.scan.rootDomain.replace(/[^a-zA-Z0-9.-]/g, "-");

    return new Response(file, {
      headers: {
        "Content-Disposition": `attachment; filename="smb-security-report-${safeDomain}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Report file is not available.", success: false },
      { status: 404 },
    );
  }
}
