import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Send } from "lucide-react";

import { adminSendTestEmail } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Email Logs",
};

export default async function AdminEmailsPage() {
  await requireAdmin();
  const prisma = getPrisma();
  const logs = await prisma.emailLog.findMany({
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });
  const rows = logs.map((log) => ({
    created: formatAdminDate(log.createdAt),
    error: log.errorMessage ?? "None",
    recipient: log.toEmail,
    status: statusBadge(log.status),
    subject: log.subject,
    template: log.templateKey,
    user: log.user ? log.user.name ?? log.user.email : "System/admin",
  }));

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Email logs"
        description="Recent transactional email attempts. Recipients are masked and message bodies are not stored."
        actions={
          <div className="flex flex-wrap gap-2">
            <form action={adminSendTestEmail}>
              <Button type="submit">
                <Send aria-hidden="true" />
                Send test email
              </Button>
            </form>
            <Button asChild variant="outline">
              <Link href="/dashboard/admin/system">System health</Link>
            </Button>
          </div>
        }
      />
      <DataTableShell
        caption="Recent email sends"
        columns={[
          { key: "created", label: "Created" },
          { key: "status", label: "Status" },
          { key: "template", label: "Template" },
          { key: "subject", label: "Subject" },
          { key: "recipient", label: "Recipient" },
          { key: "user", label: "User" },
          { key: "error", label: "Failure reason" },
        ]}
        rows={rows}
        emptyState={
          <EmptyState
            icon={<Mail className="size-5" aria-hidden="true" />}
            title="No email logs yet"
            description="Email attempts will appear here after transactional notifications are triggered."
          />
        }
      />
    </div>
  );
}
