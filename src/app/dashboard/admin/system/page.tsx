import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getSystemHealth } from "@/lib/admin";
import { statusBadge } from "@/lib/admin-ui";

export const metadata: Metadata = { title: "Admin System Health" };

export default async function AdminSystemPage() {
  const health = await getSystemHealth();
  const rows = Object.entries(health).map(([key, value]) => ({
    check: key.replace(/([A-Z])/g, " $1"),
    status: statusBadge(value ? "OK" : "MISSING"),
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="System health"
        description="Configuration and dependency checks report booleans only, never secret values."
        actions={<Button asChild variant="outline"><a href="/dashboard/admin/system">Refresh</a></Button>}
      />
      <DataTableShell
        caption="Safe health checks"
        columns={[{ key: "check", label: "Check" }, { key: "status", label: "Status" }]}
        rows={rows}
      />
    </div>
  );
}
