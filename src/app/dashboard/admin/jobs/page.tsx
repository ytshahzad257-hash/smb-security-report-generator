import type { Metadata } from "next";

import { adminMarkScanFailed, adminRetryScan } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Jobs" };

async function dateBefore(ms: number) {
  return new Date(Date.now() - ms);
}

export default async function AdminJobsPage() {
  const prisma = getPrisma();
  const stuckSince = await dateBefore(30 * 60 * 1000);
  const [errors, failedScans, stuckScans, lifecycle] = await Promise.all([
    prisma.scanLog.findMany({ where: { level: "ERROR" }, include: { scan: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.scan.findMany({ where: { status: "FAILED" }, include: { user: { select: { email: true } } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.scan.findMany({ where: { status: "RUNNING", startedAt: { lt: stuckSince } }, include: { user: { select: { email: true } } }, orderBy: { startedAt: "asc" }, take: 50 }),
    prisma.scanLog.findMany({ where: { message: { contains: "worker", mode: "insensitive" } }, include: { scan: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Jobs / Worker" description="Database-backed worker visibility. Redis URL is never displayed." />
      <DataTableShell
        caption="Recent ScanLog errors"
        columns={[{ key: "time", label: "Time" }, { key: "scan", label: "Scan" }, { key: "message", label: "Message" }]}
        rows={errors.map((log) => ({ time: formatAdminDate(log.createdAt), scan: log.scan.rootDomain, message: log.message }))}
        emptyState={<EmptyAdminState>No recent ScanLog errors.</EmptyAdminState>}
      />
      <DataTableShell
        caption="Failed scans"
        columns={[{ key: "target", label: "Target" }, { key: "user", label: "User" }, { key: "reason", label: "Reason" }, { key: "action", label: "Action" }]}
        rows={failedScans.map((scan) => ({ target: scan.rootDomain, user: scan.user.email, reason: scan.errorMessage ?? "None", action: <form action={adminRetryScan}><input type="hidden" name="scanId" value={scan.id} /><Button size="sm" type="submit">Retry</Button></form> }))}
        emptyState={<EmptyAdminState>No failed scans.</EmptyAdminState>}
      />
      <DataTableShell
        caption="Stuck running scans"
        columns={[{ key: "target", label: "Target" }, { key: "status", label: "Status" }, { key: "started", label: "Started" }, { key: "action", label: "Action" }]}
        rows={stuckScans.map((scan) => ({ target: scan.rootDomain, status: statusBadge(scan.status), started: formatAdminDate(scan.startedAt), action: <form action={adminMarkScanFailed} className="grid gap-2"><input type="hidden" name="scanId" value={scan.id} /><Input name="reason" placeholder="Reason" required /><Button size="sm" type="submit" variant="destructive">Mark failed</Button></form> }))}
        emptyState={<EmptyAdminState>No stuck running scans.</EmptyAdminState>}
      />
      <DataTableShell
        caption="Worker lifecycle logs"
        columns={[{ key: "time", label: "Time" }, { key: "scan", label: "Scan" }, { key: "message", label: "Message" }]}
        rows={lifecycle.map((log) => ({ time: formatAdminDate(log.createdAt), scan: log.scan.rootDomain, message: log.message }))}
        emptyState={<EmptyAdminState>No worker lifecycle logs found.</EmptyAdminState>}
      />
    </div>
  );
}
