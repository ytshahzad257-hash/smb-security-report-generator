import type { Metadata } from "next";

import { DataTableShell } from "@/components/ui/data-table-shell";
import { PageHeader } from "@/components/ui/page-header";
import { maskId } from "@/lib/admin";
import { EmptyAdminState, formatAdminDate } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Audit Logs" };

function safeMetadata(value: unknown) {
  if (!value) {
    return "None";
  }

  return JSON.stringify(value).replace(
    /(secret|token|password|DATABASE_URL|REDIS_URL|LEMONSQUEEZY_API_KEY|LEMONSQUEEZY_WEBHOOK_SECRET)[^",}]*/gi,
    "[redacted]",
  );
}

export default async function AdminAuditPage() {
  const prisma = getPrisma();
  const logs = await prisma.adminAuditLog.findMany({
    include: {
      adminUser: { select: { email: true } },
      targetUser: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Audit logs" description="Write actions performed in the admin panel." />
      <DataTableShell
        caption={`${logs.length} audit entries`}
        columns={[{ key: "action", label: "Action" }, { key: "admin", label: "Admin" }, { key: "targetUser", label: "Target user" }, { key: "target", label: "Target" }, { key: "reason", label: "Reason" }, { key: "time", label: "Timestamp" }, { key: "metadata", label: "Metadata" }]}
        rows={logs.map((log) => ({
          action: log.action,
          admin: log.adminUser.email,
          targetUser: log.targetUser?.email ?? "None",
          target: `${log.targetType ?? "None"} ${maskId(log.targetId) ?? ""}`,
          reason: log.reason ?? "None",
          time: formatAdminDate(log.createdAt),
          metadata: <code className="text-xs">{safeMetadata(log.metadata)}</code>,
        }))}
        emptyState={<EmptyAdminState>No audit entries.</EmptyAdminState>}
      />
    </div>
  );
}
