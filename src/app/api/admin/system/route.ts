import { NextResponse } from "next/server";

import { getSystemHealth, requireAdminApi } from "@/lib/admin";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  return NextResponse.json({ health: await getSystemHealth(), success: true });
}
