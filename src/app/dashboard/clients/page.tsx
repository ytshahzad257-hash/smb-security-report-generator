import type { Metadata } from "next";

import { ClientManager } from "@/components/clients/client-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { canManageClients } from "@/lib/billing";
import { listClientsForUser } from "@/lib/clients/clientService";

export const metadata: Metadata = {
  title: "Clients",
  description: "Manage clients and organize reports.",
};

export default async function ClientsPage() {
  const user = await requireUser();
  const hasAccess = await canManageClients(user.id);
  const clients = hasAccess ? await listClientsForUser(user.id) : [];

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Clients"
        title="Client management"
        description="Organize scans and generated reports by client."
      />
      <ClientManager clients={clients} locked={!hasAccess} />
    </div>
  );
}
