import { NextResponse } from "next/server";
import { z } from "zod";

import { adjustUserCredits, enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]/credits">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/users/[id]/credits",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const parsed = z.object({ amount: z.number().int(), reason: z.string().trim().min(3) }).safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "Valid credit amount and reason are required.", success: false }, { status: 400 });
  }

  try {
    const subscription = await adjustUserCredits({ adminUserId: auth.user.id, userId: id, ...parsed.data });
    return NextResponse.json({ subscription, success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Credits could not be adjusted.", success: false }, { status: 400 });
  }
}
