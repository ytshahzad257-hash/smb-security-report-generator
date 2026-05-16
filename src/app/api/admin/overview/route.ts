import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    adminUsers,
    activeSubscriptions,
    totalScans,
    completedScans,
    failedScans,
    runningScans,
    reports,
    activeShares,
    clients,
    pendingPayments,
    approvedPayments,
    rejectedPayments,
    subscriptions,
    scans24h,
    reports24h,
    failed24h,
    newUsers7d,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.scan.count(),
    prisma.scan.count({ where: { status: "COMPLETED" } }),
    prisma.scan.count({ where: { status: "FAILED" } }),
    prisma.scan.count({ where: { status: "RUNNING" } }),
    prisma.report.count({ where: { status: "GENERATED" } }),
    prisma.reportShare.count({ where: { isActive: true } }),
    prisma.client.count(),
    prisma.manualPaymentRequest.count({ where: { status: "PENDING" } }),
    prisma.manualPaymentRequest.count({ where: { status: "APPROVED" } }),
    prisma.manualPaymentRequest.count({ where: { status: "REJECTED" } }),
    prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { creditsRemaining: true } }),
    prisma.scan.count({ where: { createdAt: { gte: since24h } } }),
    prisma.report.count({ where: { createdAt: { gte: since24h } } }),
    prisma.scan.count({ where: { status: "FAILED", updatedAt: { gte: since24h } } }),
    prisma.user.count({ where: { createdAt: { gte: since7d } } }),
  ]);

  return NextResponse.json({
    metrics: {
      totalUsers,
      adminUsers,
      activeSubscriptions,
      totalScans,
      completedScans,
      failedScans,
      runningScans,
      generatedReports: reports,
      activeShareLinks: activeShares,
      totalClients: clients,
      pendingManualPayments: pendingPayments,
      approvedManualPayments: approvedPayments,
      rejectedManualPayments: rejectedPayments,
      totalReportCreditsRemaining: subscriptions.reduce((sum, item) => sum + item.creditsRemaining, 0),
      scansLast24h: scans24h,
      reportsLast24h: reports24h,
      failedScansLast24h: failed24h,
      newUsersLast7d: newUsers7d,
    },
    success: true,
  });
}
