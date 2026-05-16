import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request, context: RouteContext<"/api/admin/scans/[id]">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();
  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      findings: true,
      reports: { select: { id: true, reportType: true, status: true, generatedAt: true, createdAt: true } },
      logs: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found.", success: false }, { status: 404 });
  }

  return NextResponse.json({ scan, success: true });
}
