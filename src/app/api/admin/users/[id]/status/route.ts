import { NextResponse } from "next/server";
import { z } from "zod";

import { changeUserStatus, enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]/status">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/users/[id]/status",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const parsed = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3) }).safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "Valid status and reason are required.", success: false }, { status: 400 });
  }

  const user = await changeUserStatus({ adminUserId: auth.user.id, userId: id, ...parsed.data });
  return NextResponse.json({ user, success: true });
}
