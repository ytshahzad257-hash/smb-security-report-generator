import { NextResponse } from "next/server";

import { maskId, requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const logs = await prisma.adminAuditLog.findMany({
    include: { adminUser: { select: { email: true } }, targetUser: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    logs: logs.map((log) => ({ ...log, targetId: maskId(log.targetId) })),
    success: true,
  });
}
