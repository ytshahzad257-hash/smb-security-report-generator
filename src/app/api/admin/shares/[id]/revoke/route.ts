import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceAdminWriteRateLimit, requireAdminApi, revokeShare } from "@/lib/admin";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/shares/[id]/revoke">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/shares/[id]/revoke",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const parsed = z.object({ reason: z.string().trim().min(3) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Reason is required.", success: false }, { status: 400 });

  const share = await revokeShare({ adminUserId: auth.user.id, shareId: id, reason: parsed.data.reason });
  return NextResponse.json({ share: { id: share.id, isActive: share.isActive }, success: true });
}
