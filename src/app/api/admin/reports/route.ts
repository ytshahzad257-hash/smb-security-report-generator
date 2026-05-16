import { stat } from "fs/promises";
import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

async function fileExists(filePath: string | null) {
  return filePath ? stat(filePath).then((value) => value.isFile()).catch(() => false) : false;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const reports = await prisma.report.findMany({
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      scan: { select: { rootDomain: true, score: true, grade: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const serialized = await Promise.all(reports.map(async (report) => ({
    id: report.id,
    user: report.user,
    client: report.client,
    targetDomain: report.scan.rootDomain,
    score: report.scan.score,
    grade: report.scan.grade,
    reportType: report.reportType,
    status: report.status,
    generatedAt: report.generatedAt,
    createdAt: report.createdAt,
    fileExists: await fileExists(report.filePath),
  })));

  return NextResponse.json({ reports: serialized, success: true });
}
