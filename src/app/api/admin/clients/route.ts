import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const clients = await prisma.client.findMany({
    include: { user: { select: { email: true, name: true } }, _count: { select: { scans: true, reports: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ clients, success: true });
}
