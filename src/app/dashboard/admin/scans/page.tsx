import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";

import { adminMarkScanFailed, adminRetryScan } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Scans" };

export default async function AdminScansPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const status = ["PENDING", "RUNNING", "COMPLETED", "FAILED"].includes(params.status ?? "") ? params.status : undefined;
  const prisma = getPrisma();
  const scans = await prisma.scan.findMany({
    where: status ? { status: status as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" } : undefined,
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      _count: { select: { findings: true, reports: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const filtered = q
    ? scans.filter((scan) => [scan.targetUrl, scan.rootDomain, scan.user.email, scan.client?.name, scan.clientName].some((value) => value?.toLowerCase().includes(q)))
    : scans;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Scans" description="Monitor scan status, logs, findings, and report generation." />
      <form className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto]">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Search target, domain, user, or client" />
        <select name="status" defaultValue={params.status ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="RUNNING">RUNNING</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="FAILED">FAILED</option>
        </select>
        <Button type="submit" variant="outline"><Search aria-hidden="true" />Search</Button>
      </form>
      <DataTableShell
        caption={`${filtered.length} scans`}
        columns={[{ key: "target", label: "Target" }, { key: "user", label: "User" }, { key: "client", label: "Client" }, { key: "status", label: "Status" }, { key: "score", label: "Score" }, { key: "findings", label: "Findings" }, { key: "dates", label: "Dates" }, { key: "actions", label: "Actions" }]}
        rows={filtered.map((scan) => ({
          target: <Link className="font-semibold text-primary hover:underline" href={`/dashboard/admin/scans/${scan.id}`}>{scan.rootDomain}<span className="block text-xs font-normal text-muted-foreground">{scan.targetUrl}</span></Link>,
          user: scan.user.email,
          client: scan.client?.companyName ?? scan.client?.name ?? scan.clientName ?? "None",
          status: statusBadge(scan.status),
          score: scan.score === null ? "None" : `${scan.score} / ${scan.grade ?? "N/A"}`,
          findings: `${scan._count.findings} findings, ${scan._count.reports} reports`,
          dates: <span>Created {formatAdminDate(scan.createdAt)}<br />Started {formatAdminDate(scan.startedAt)}<br />Completed {formatAdminDate(scan.completedAt)}</span>,
          actions: (
            <div className="grid gap-2">
              {scan.status === "FAILED" ? <form action={adminRetryScan}><input type="hidden" name="scanId" value={scan.id} /><Button size="sm" type="submit">Retry</Button></form> : null}
              {scan.status === "RUNNING" ? <form action={adminMarkScanFailed} className="grid gap-2"><input type="hidden" name="scanId" value={scan.id} /><Input name="reason" placeholder="Reason" required /><Button size="sm" type="submit" variant="destructive">Mark failed</Button></form> : null}
            </div>
          ),
        }))}
        emptyState={<EmptyAdminState>No scans match the filters.</EmptyAdminState>}
      />
    </div>
  );
}
