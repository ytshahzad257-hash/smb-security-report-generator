import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceAdminWriteRateLimit, markScanFailed, requireAdminApi } from "@/lib/admin";

export async function POST(request: Request, context: RouteContext<"/api/admin/scans/[id]/mark-failed">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/scans/[id]/mark-failed",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const parsed = z.object({ reason: z.string().trim().min(3) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Reason is required.", success: false }, { status: 400 });

  try {
    await markScanFailed({ adminUserId: auth.user.id, scanId: id, reason: parsed.data.reason });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scan could not be marked failed.", success: false }, { status: 400 });
  }
}
