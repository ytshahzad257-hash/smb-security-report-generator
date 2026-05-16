import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const scans = await prisma.scan.findMany({
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      _count: { select: { findings: true, reports: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ scans, success: true });
}
