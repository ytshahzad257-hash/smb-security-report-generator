import type { Metadata } from "next";

import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Clients" };

export default async function AdminClientsPage() {
  const prisma = getPrisma();
  const clients = await prisma.client.findMany({
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { scans: true, reports: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Clients" description="Read-only client inventory across all account owners." />
      <DataTableShell
        caption={`${clients.length} clients`}
        columns={[{ key: "name", label: "Client" }, { key: "email", label: "Contact" }, { key: "website", label: "Website" }, { key: "owner", label: "Owner" }, { key: "counts", label: "Usage" }, { key: "created", label: "Created" }]}
        rows={clients.map((client) => ({
          name: <span>{client.name}<span className="block text-xs text-muted-foreground">{client.companyName ?? "No company"}</span></span>,
          email: client.contactEmail ?? "None",
          website: client.website ?? "None",
          owner: `${client.user.name ?? "Unnamed"} (${client.user.email})`,
          counts: `${client._count.scans} scans, ${client._count.reports} reports`,
          created: formatAdminDate(client.createdAt),
        }))}
        emptyState={<EmptyAdminState>No clients found.</EmptyAdminState>}
      />
    </div>
  );
}
