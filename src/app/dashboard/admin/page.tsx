import type { Metadata } from "next";
import { Activity, FileText, ReceiptText, ScanLine, Share2, Users } from "lucide-react";

import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Overview" };

async function dateBefore(ms: number) {
  return new Date(Date.now() - ms);
}

export default async function AdminOverviewPage() {
  const prisma = getPrisma();
  const since24h = await dateBefore(24 * 60 * 60 * 1000);
  const since7d = await dateBefore(7 * 24 * 60 * 60 * 1000);
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
    recentScans,
    recentReports,
    recentPayments,
    recentFailedScans,
    recentAbuse,
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
    prisma.scan.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
    prisma.report.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } }, scan: { select: { rootDomain: true, grade: true } } },
    }),
    prisma.manualPaymentRequest.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
    prisma.scan.findMany({
      take: 5,
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
    prisma.abuseLog.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
    }),
  ]);
  const creditsRemaining = subscriptions.reduce((sum, item) => sum + item.creditsRemaining, 0);
  const metrics = [
    ["Total users", totalUsers, Users],
    ["Admin users", adminUsers, Users],
    ["Active subscriptions", activeSubscriptions, Activity],
    ["Total scans", totalScans, ScanLine],
    ["Completed scans", completedScans, ScanLine],
    ["Failed scans", failedScans, ScanLine],
    ["Running scans", runningScans, ScanLine],
    ["Generated PDF reports", reports, FileText],
    ["Active share links", activeShares, Share2],
    ["Total clients", clients, Users],
    ["Pending manual payments", pendingPayments, ReceiptText],
    ["Approved manual payments", approvedPayments, ReceiptText],
    ["Rejected manual payments", rejectedPayments, ReceiptText],
    ["Report credits remaining", creditsRemaining, Activity],
    ["Scans last 24h", scans24h, ScanLine],
    ["Reports last 24h", reports24h, FileText],
    ["Failed scans last 24h", failed24h, ScanLine],
    ["New users last 7d", newUsers7d, Users],
  ] as const;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Internal"
        title="Admin overview"
        description="Operational metrics from the live database."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value, Icon]) => (
          <StatCard key={label} label={label} value={String(value)} icon={<Icon aria-hidden="true" />} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <DataTableShell
          caption="Recent scans"
          columns={[{ key: "target", label: "Target" }, { key: "user", label: "User" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]}
          rows={recentScans.map((scan) => ({
            target: scan.rootDomain,
            user: scan.user.email,
            status: statusBadge(scan.status),
            created: formatAdminDate(scan.createdAt),
          }))}
          emptyState={<EmptyAdminState>No recent scans.</EmptyAdminState>}
        />
        <DataTableShell
          caption="Recent reports"
          columns={[{ key: "target", label: "Target" }, { key: "user", label: "User" }, { key: "grade", label: "Grade" }, { key: "created", label: "Created" }]}
          rows={recentReports.map((report) => ({
            target: report.scan.rootDomain,
            user: report.user.email,
            grade: report.scan.grade ?? "None",
            created: formatAdminDate(report.createdAt),
          }))}
          emptyState={<EmptyAdminState>No recent reports.</EmptyAdminState>}
        />
        <DataTableShell
          caption="Recent payment requests"
          columns={[{ key: "user", label: "User" }, { key: "package", label: "Package" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]}
          rows={recentPayments.map((payment) => ({
            user: payment.user.email,
            package: payment.packageName,
            status: statusBadge(payment.status),
            created: formatAdminDate(payment.createdAt),
          }))}
          emptyState={<EmptyAdminState>No recent payment requests.</EmptyAdminState>}
        />
        <DataTableShell
          caption="Recent failed scans"
          columns={[{ key: "target", label: "Target" }, { key: "user", label: "User" }, { key: "reason", label: "Reason" }]}
          rows={recentFailedScans.map((scan) => ({
            target: scan.rootDomain,
            user: scan.user.email,
            reason: scan.errorMessage ?? "No reason recorded",
          }))}
          emptyState={<EmptyAdminState>No failed scans.</EmptyAdminState>}
        />
        <DataTableShell
          caption="Recent abuse/security events"
          columns={[{ key: "time", label: "Time" }, { key: "event", label: "Event" }, { key: "user", label: "User" }, { key: "reason", label: "Reason" }]}
          rows={recentAbuse.map((event) => ({
            time: formatAdminDate(event.createdAt),
            event: statusBadge(event.eventType),
            user: event.user?.email ?? "Anonymous",
            reason: event.reason,
          }))}
          emptyState={<EmptyAdminState>No abuse events.</EmptyAdminState>}
        />
      </div>
    </div>
  );
}
