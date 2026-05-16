import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const stuckSince = new Date(Date.now() - 30 * 60 * 1000);
  const [errors, failedScans, stuckScans, lifecycle] = await Promise.all([
    prisma.scanLog.findMany({ where: { level: "ERROR" }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.scan.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.scan.findMany({ where: { status: "RUNNING", startedAt: { lt: stuckSince } }, orderBy: { startedAt: "asc" }, take: 50 }),
    prisma.scanLog.findMany({ where: { message: { contains: "worker", mode: "insensitive" } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return NextResponse.json({ errors, failedScans, stuckScans, lifecycle, queueCounts: null, success: true });
}
