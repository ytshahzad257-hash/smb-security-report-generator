import { NextResponse } from "next/server";

import { enforceAdminWriteRateLimit, requireAdminApi, retryFailedScan } from "@/lib/admin";

export async function POST(request: Request, context: RouteContext<"/api/admin/scans/[id]/retry">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/scans/[id]/retry",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  try {
    await retryFailedScan(auth.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scan could not be retried.", success: false }, { status: 400 });
  }
}
