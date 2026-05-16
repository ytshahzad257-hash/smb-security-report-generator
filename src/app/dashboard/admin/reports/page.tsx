import type { Metadata } from "next";
import { stat } from "fs/promises";

import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Reports" };

async function fileExists(filePath: string | null) {
  return filePath ? stat(filePath).then((value) => value.isFile()).catch(() => false) : false;
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ q?: string; branded?: string; grade?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const prisma = getPrisma();
  const reports = await prisma.report.findMany({
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      scan: { select: { rootDomain: true, score: true, grade: true } },
      shares: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const agencyProfiles = await prisma.agencyProfile.findMany({ select: { userId: true, agencyName: true } });
  const agencyByUser = new Map(agencyProfiles.map((agency) => [agency.userId, agency.agencyName]));
  const rows = await Promise.all(
    reports
      .filter((report) => {
        const agency = agencyByUser.get(report.userId);
        const branded = report.reportType === "WHITE_LABEL";
        return (
          (!q || [report.scan.rootDomain, report.user.email, report.client?.name, report.client?.companyName, agency].some((value) => value?.toLowerCase().includes(q))) &&
          (!params.branded || (params.branded === "yes" ? branded : !branded)) &&
          (!params.grade || report.scan.grade === params.grade)
        );
      })
      .map(async (report) => ({
        target: report.scan.rootDomain,
        user: report.user.email,
        client: report.client?.companyName ?? report.client?.name ?? report.clientName ?? "None",
        agency: agencyByUser.get(report.userId) ?? "None",
        score: `${report.scan.score ?? "None"} / ${report.scan.grade ?? "N/A"}`,
        generated: formatAdminDate(report.generatedAt ?? report.createdAt),
        branded: report.reportType === "WHITE_LABEL" ? "Yes" : "No",
        exists: (await fileExists(report.filePath)) ? statusBadge("YES") : statusBadge("Missing file"),
        download: report.filePath ? <a className="text-primary hover:underline" href={`/api/admin/reports/${report.id}/download`}>Secure download</a> : "Unavailable",
      })),
  );

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Reports" description="Generated report metadata and controlled downloads." />
      <DataTableShell
        caption={`${rows.length} reports`}
        columns={[{ key: "target", label: "Target" }, { key: "user", label: "User" }, { key: "client", label: "Client" }, { key: "agency", label: "Agency" }, { key: "score", label: "Score/Grade" }, { key: "generated", label: "Generated" }, { key: "branded", label: "Branded" }, { key: "exists", label: "File" }, { key: "download", label: "Action" }]}
        rows={rows}
        emptyState={<EmptyAdminState>No reports match the filters.</EmptyAdminState>}
      />
    </div>
  );
}
