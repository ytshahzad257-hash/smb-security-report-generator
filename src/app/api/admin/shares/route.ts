import { NextResponse } from "next/server";

import { maskToken, requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const shares = await prisma.reportShare.findMany({
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      report: { include: { scan: { select: { rootDomain: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    shares: shares.map((share) => ({
      id: share.id,
      title: share.title,
      maskedToken: maskToken(share.token),
      isActive: share.isActive,
      expiresAt: share.expiresAt,
      passwordProtected: Boolean(share.passwordHash),
      viewCount: share.viewCount,
      lastViewedAt: share.lastViewedAt,
      createdAt: share.createdAt,
      user: share.user,
      client: share.client,
      targetDomain: share.report.scan.rootDomain,
    })),
    success: true,
  });
}
