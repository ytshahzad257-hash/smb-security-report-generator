import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const plans = await prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { price: "asc" }] });
  return NextResponse.json({ plans: plans.map((plan) => ({ ...plan, price: plan.price.toString() })), success: true });
}
