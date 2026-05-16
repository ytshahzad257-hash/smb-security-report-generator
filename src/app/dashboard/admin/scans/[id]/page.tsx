import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { adminMarkScanFailed, adminRetryScan } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Scan Detail" };

export default async function AdminScanDetailPage(props: PageProps<"/dashboard/admin/scans/[id]">) {
  const { id } = await props.params;
  const prisma = getPrisma();
  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      findings: { orderBy: { severity: "asc" } },
      reports: { orderBy: { createdAt: "desc" } },
      logs: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  if (!scan) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin scan" title={scan.rootDomain} description={scan.targetUrl} />
      <Card>
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div>User: {scan.user.email}</div>
          <div>Client: {scan.client?.companyName ?? scan.client?.name ?? scan.clientName ?? "None"}</div>
          <div>Status: {statusBadge(scan.status)}</div>
          <div>Score: {scan.score ?? "None"}</div>
          <div>Grade: {scan.grade ?? "None"}</div>
          <div>Created: {formatAdminDate(scan.createdAt)}</div>
          <div>Started: {formatAdminDate(scan.startedAt)}</div>
          <div>Completed: {formatAdminDate(scan.completedAt)}</div>
          <div>Failure: {scan.errorMessage ?? "None"}</div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        {scan.status === "FAILED" ? <form action={adminRetryScan}><input type="hidden" name="scanId" value={scan.id} /><Button type="submit">Retry failed scan</Button></form> : null}
        {scan.status === "RUNNING" ? <form action={adminMarkScanFailed} className="flex flex-wrap gap-2"><input type="hidden" name="scanId" value={scan.id} /><Input name="reason" placeholder="Reason" required /><Button type="submit" variant="destructive">Mark failed</Button></form> : null}
      </div>
      <DataTableShell
        caption="Findings summary"
        columns={[{ key: "severity", label: "Severity" }, { key: "title", label: "Title" }, { key: "category", label: "Category" }]}
        rows={scan.findings.map((finding) => ({ severity: statusBadge(finding.severity), title: finding.title, category: finding.category }))}
        emptyState={<EmptyAdminState>No findings saved.</EmptyAdminState>}
      />
      <DataTableShell
        caption="Generated reports"
        columns={[{ key: "report", label: "Report" }, { key: "type", label: "Type" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]}
        rows={scan.reports.map((report) => ({ report: <Link className="text-primary hover:underline" href={`/api/admin/reports/${report.id}/download`}>Download via secure route</Link>, type: report.reportType, status: statusBadge(report.status), created: formatAdminDate(report.createdAt) }))}
        emptyState={<EmptyAdminState>No reports generated.</EmptyAdminState>}
      />
      <DataTableShell
        caption="Scan logs"
        columns={[{ key: "time", label: "Time" }, { key: "level", label: "Level" }, { key: "message", label: "Message" }]}
        rows={scan.logs.map((log) => ({ time: formatAdminDate(log.createdAt), level: statusBadge(log.level), message: log.message }))}
        emptyState={<EmptyAdminState>No scan logs.</EmptyAdminState>}
      />
    </div>
  );
}
