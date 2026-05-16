import type { Metadata } from "next";
import Link from "next/link";

import { DataTableShell } from "@/components/ui/data-table-shell";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Abuse Logs" };

function safeMetadata(value: unknown) {
  if (!value) {
    return "None";
  }

  return JSON.stringify(value).replace(/(secret|token|password|DATABASE_URL|REDIS_URL)[^",}]*/gi, "[redacted]");
}

function safeDisplayTarget(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return value.replace(/[/?#].*$/, "").replace(/token|password/gi, "[redacted]");
  }
}

const eventFilters = [
  ["ALL", "All"],
  ["RATE_LIMIT_TRIGGERED", "Rate limits"],
  ["PDF_RATE_LIMIT_TRIGGERED", "PDF"],
  ["SHARE_PASSWORD_RATE_LIMIT", "Share passwords"],
  ["PAYMENT_PROOF_RATE_LIMIT", "Payment proof"],
  ["WEBHOOK_REPLAY_BLOCKED", "Webhooks"],
  ["UNAUTHORIZED_ADMIN_ACCESS", "Admin access"],
] as const;

export default async function AdminAbusePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const params = await searchParams;
  const selectedEvent = params.event && params.event !== "ALL" ? params.event : null;
  const prisma = getPrisma();
  const events = await prisma.abuseLog.findMany({
    include: { user: { select: { email: true } } },
    where: selectedEvent ? { eventType: selectedEvent } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Abuse logs" description="Security and abuse events with safe metadata only." />
      <div className="flex flex-wrap gap-2">
        {eventFilters.map(([value, label]) => {
          const active = selectedEvent ? selectedEvent === value : value === "ALL";
          const href = value === "ALL" ? "/dashboard/admin/abuse" : `/dashboard/admin/abuse?event=${value}`;

          return (
            <Button key={value} asChild size="sm" variant={active ? "default" : "outline"}>
              <Link href={href}>{label}</Link>
            </Button>
          );
        })}
      </div>
      <DataTableShell
        caption={`${events.length} events`}
        columns={[{ key: "time", label: "Timestamp" }, { key: "user", label: "User" }, { key: "ip", label: "IP" }, { key: "event", label: "Event" }, { key: "target", label: "Target" }, { key: "severity", label: "Severity" }, { key: "reason", label: "Reason" }, { key: "metadata", label: "Metadata" }]}
        rows={events.map((event) => ({
          time: formatAdminDate(event.createdAt),
          user: event.user?.email ?? "Anonymous",
          ip: event.ipAddress ? `${event.ipAddress.split(".").slice(0, 2).join(".")}.*.*` : "None",
          event: event.eventType,
          target: safeDisplayTarget(event.target ?? event.targetUrl),
          severity: statusBadge(event.severity),
          reason: event.reason,
          metadata: <code className="text-xs">{safeMetadata(event.metadata)}</code>,
        }))}
        emptyState={<EmptyAdminState>No abuse events found.</EmptyAdminState>}
      />
    </div>
  );
}
