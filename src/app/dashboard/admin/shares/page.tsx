import type { Metadata } from "next";

import { adminRevokeShare } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { maskToken } from "@/lib/admin";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Share Links" };

export default async function AdminSharesPage() {
  const prisma = getPrisma();
  const shares = await prisma.reportShare.findMany({
    include: {
      user: { select: { email: true } },
      client: { select: { name: true, companyName: true } },
      report: { include: { scan: { select: { rootDomain: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const now = new Date();

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Share links" description="Inspect and revoke shared report access without exposing full tokens." />
      <DataTableShell
        caption={`${shares.length} share links`}
        columns={[{ key: "title", label: "Report" }, { key: "owner", label: "Owner" }, { key: "client", label: "Client" }, { key: "status", label: "Status" }, { key: "token", label: "Token" }, { key: "protected", label: "Protected" }, { key: "views", label: "Views" }, { key: "dates", label: "Dates" }, { key: "action", label: "Action" }]}
        rows={shares.map((share) => {
          const expired = share.expiresAt ? share.expiresAt < now : false;

          return {
            title: `${share.title ?? "Shared report"} (${share.report.scan.rootDomain})`,
            owner: share.user.email,
            client: share.client?.companyName ?? share.client?.name ?? "None",
            status: statusBadge(!share.isActive ? "REVOKED" : expired ? "EXPIRED" : "ACTIVE"),
            token: maskToken(share.token),
            protected: share.passwordHash ? "Yes" : "No",
            views: `${share.viewCount} views, last ${formatAdminDate(share.lastViewedAt)}`,
            dates: `Expires ${formatAdminDate(share.expiresAt)}; created ${formatAdminDate(share.createdAt)}`,
            action: share.isActive ? (
              <form action={adminRevokeShare} className="grid gap-2">
                <input type="hidden" name="shareId" value={share.id} />
                <Input name="reason" placeholder="Reason" required />
                <Button type="submit" size="sm" variant="destructive">Revoke</Button>
              </form>
            ) : "Closed",
          };
        })}
        emptyState={<EmptyAdminState>No share links found.</EmptyAdminState>}
      />
    </div>
  );
}
