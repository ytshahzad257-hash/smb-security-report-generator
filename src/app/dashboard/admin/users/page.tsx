import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";

import { DataTableShell } from "@/components/ui/data-table-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";
import { maskStripeId } from "@/lib/stripe";
import { maskLemonId } from "@/lib/lemon";

export const metadata: Metadata = { title: "Admin Users" };

function matches(value: string | null | undefined, query: string) {
  return value?.toLowerCase().includes(query) ?? false;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().toLowerCase() ?? "";
  const role = params.role === "USER" || params.role === "ADMIN" ? params.role : undefined;
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: role ? { role } : undefined,
    include: {
      subscriptions: { include: { plan: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      _count: { select: { scans: true, reports: true, clients: true, reportShares: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const filtered = q
    ? users.filter((user) => matches(user.name, q) || matches(user.email, q) || matches(user.subscriptions[0]?.plan.name, q))
    : users;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title="Users" description="Manage account roles, status, subscriptions, and credits." />
      <form className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto]">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Search name, email, or plan" />
        <select name="role" defaultValue={params.role ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All roles</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <Button type="submit" variant="outline"><Search aria-hidden="true" />Search</Button>
      </form>
      <DataTableShell
        caption={`${filtered.length} users`}
        columns={[
          { key: "user", label: "User" },
          { key: "role", label: "Role" },
          { key: "status", label: "Status" },
          { key: "plan", label: "Current plan" },
          { key: "provider", label: "Provider" },
          { key: "subscription", label: "Subscription" },
          { key: "stripe", label: "Stripe customer" },
          { key: "lemon", label: "Lemon customer" },
          { key: "credits", label: "Credits" },
          { key: "counts", label: "Usage" },
          { key: "created", label: "Created" },
        ]}
        rows={filtered.map((user) => {
          const subscription = user.subscriptions[0];

          return {
            user: <Link className="font-semibold text-primary hover:underline" href={`/dashboard/admin/users/${user.id}`}>{user.name ?? "Unnamed"}<span className="block text-xs font-normal text-muted-foreground">{user.email}</span></Link>,
            role: statusBadge(user.role),
            status: statusBadge(user.status),
            plan: subscription?.plan.name ?? "None",
            provider: subscription?.provider ?? "None",
            subscription: subscription ? statusBadge(subscription.status) : "None",
            stripe: maskStripeId(user.stripeCustomerId),
            lemon: maskLemonId(user.lemonCustomerId),
            credits: subscription ? `${subscription.creditsRemaining}/${subscription.creditsTotal}` : "0/0",
            counts: `${user._count.scans} scans, ${user._count.reports} reports, ${user._count.clients} clients, ${user._count.reportShares} shares`,
            created: formatAdminDate(user.createdAt),
          };
        })}
        emptyState={<EmptyAdminState>No users match the filters.</EmptyAdminState>}
      />
    </div>
  );
}
