import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { safeAbuseMetadata, safeAbuseTarget } from "@/lib/security/abuseLog";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const events = await prisma.abuseLog.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      metadata: safeAbuseMetadata(event.metadata),
      target: safeAbuseTarget(event.target ?? event.targetUrl),
      targetUrl: safeAbuseTarget(event.target ?? event.targetUrl),
    })),
    success: true,
  });
}
