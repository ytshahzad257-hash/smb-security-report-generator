import { NextResponse } from "next/server";
import { z } from "zod";

import { changeUserRole, enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]/role">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/users/[id]/role",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const parsed = z.object({ role: z.enum(["USER", "ADMIN"]), reason: z.string().trim().min(3) }).safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "Valid role and reason are required.", success: false }, { status: 400 });
  }

  try {
    const user = await changeUserRole({ adminUserId: auth.user.id, userId: id, ...parsed.data });
    return NextResponse.json({ user, success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Role could not be changed.", success: false }, { status: 400 });
  }
}
