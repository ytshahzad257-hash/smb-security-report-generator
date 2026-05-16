import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  adminAdjustCredits,
  adminChangeUserRole,
  adminChangeUserStatus,
} from "@/app/actions/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyAdminState, formatAdminDate, statusBadge } from "@/lib/admin-ui";
import { getPrisma } from "@/lib/prisma";
import { maskStripeId } from "@/lib/stripe";
import { maskLemonId } from "@/lib/lemon";

export const metadata: Metadata = { title: "Admin User Detail" };

export default async function AdminUserDetailPage(props: PageProps<"/dashboard/admin/users/[id]">) {
  const { id } = await props.params;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      subscriptions: { include: { plan: true }, orderBy: { updatedAt: "desc" } },
      scans: { take: 5, orderBy: { createdAt: "desc" } },
      reports: { take: 5, orderBy: { createdAt: "desc" }, include: { scan: { select: { rootDomain: true, grade: true, score: true } } } },
      manualPaymentRequests: { take: 5, orderBy: { createdAt: "desc" } },
      clients: { take: 5, orderBy: { createdAt: "desc" } },
      reportShares: { take: 5, orderBy: { createdAt: "desc" }, include: { report: { include: { scan: { select: { rootDomain: true } } } } } },
      abuseLogs: { take: 5, orderBy: { createdAt: "desc" } },
      agencyProfile: true,
    },
  });

  if (!user) {
    notFound();
  }

  const activeSubscription = user.subscriptions.find((item) => item.status === "ACTIVE") ?? user.subscriptions[0];

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin user" title={user.name ?? user.email} description={user.email} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Profile and plan</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">Role</span><div>{statusBadge(user.role)}</div></div>
              <div><span className="text-muted-foreground">Status</span><div>{statusBadge(user.status)}</div></div>
              <div><span className="text-muted-foreground">Created</span><div>{formatAdminDate(user.createdAt)}</div></div>
              <div><span className="text-muted-foreground">Plan</span><div>{activeSubscription?.plan.name ?? "None"}</div></div>
              <div><span className="text-muted-foreground">Provider</span><div>{activeSubscription?.provider ?? "None"}</div></div>
              <div><span className="text-muted-foreground">Stripe customer</span><div>{maskStripeId(user.stripeCustomerId)}</div></div>
              <div><span className="text-muted-foreground">Stripe subscription</span><div>{maskStripeId(activeSubscription?.stripeSubscriptionId)}</div></div>
              <div><span className="text-muted-foreground">Lemon customer</span><div>{maskLemonId(user.lemonCustomerId)}</div></div>
              <div><span className="text-muted-foreground">Lemon subscription</span><div>{maskLemonId(activeSubscription?.lemonSubscriptionId)}</div></div>
              <div><span className="text-muted-foreground">Credits</span><div>{activeSubscription ? `${activeSubscription.creditsRemaining}/${activeSubscription.creditsTotal}` : "0/0"}</div></div>
              <div><span className="text-muted-foreground">Agency</span><div>{user.agencyProfile?.agencyName ?? "None"}</div></div>
            </CardContent>
          </Card>
          <DataTableShell
            caption="Recent scans"
            columns={[{ key: "target", label: "Target" }, { key: "status", label: "Status" }, { key: "score", label: "Score" }, { key: "created", label: "Created" }]}
            rows={user.scans.map((scan) => ({ target: scan.rootDomain, status: statusBadge(scan.status), score: scan.score ?? "None", created: formatAdminDate(scan.createdAt) }))}
            emptyState={<EmptyAdminState>No scans.</EmptyAdminState>}
          />
          <DataTableShell
            caption="Recent reports"
            columns={[{ key: "target", label: "Target" }, { key: "grade", label: "Grade" }, { key: "created", label: "Created" }]}
            rows={user.reports.map((report) => ({ target: report.scan.rootDomain, grade: report.scan.grade ?? "None", created: formatAdminDate(report.createdAt) }))}
            emptyState={<EmptyAdminState>No reports.</EmptyAdminState>}
          />
          <DataTableShell
            caption="Payment requests"
            columns={[{ key: "package", label: "Package" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]}
            rows={user.manualPaymentRequests.map((payment) => ({ package: payment.packageName, status: statusBadge(payment.status), created: formatAdminDate(payment.createdAt) }))}
            emptyState={<EmptyAdminState>No payment requests.</EmptyAdminState>}
          />
          <DataTableShell
            caption="Clients and share links"
            columns={[{ key: "type", label: "Type" }, { key: "name", label: "Name" }, { key: "created", label: "Created" }]}
            rows={[
              ...user.clients.map((client) => ({ type: "Client", name: client.companyName ?? client.name, created: formatAdminDate(client.createdAt) })),
              ...user.reportShares.map((share) => ({ type: "Share", name: share.title ?? share.report.scan.rootDomain, created: formatAdminDate(share.createdAt) })),
            ]}
            emptyState={<EmptyAdminState>No clients or shares.</EmptyAdminState>}
          />
          <DataTableShell
            caption="Recent abuse/rate-limit events"
            columns={[{ key: "time", label: "Time" }, { key: "event", label: "Event" }, { key: "severity", label: "Severity" }, { key: "reason", label: "Reason" }]}
            rows={user.abuseLogs.map((event) => ({
              time: formatAdminDate(event.createdAt),
              event: event.eventType,
              severity: statusBadge(event.severity),
              reason: event.reason,
            }))}
            emptyState={<EmptyAdminState>No abuse events for this user.</EmptyAdminState>}
          />
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader><CardTitle>Change role</CardTitle></CardHeader>
            <CardContent>
              <form action={adminChangeUserRole} className="grid gap-3">
                <input type="hidden" name="userId" value={user.id} />
                <select name="role" defaultValue={user.role === "ADMIN" ? "ADMIN" : "USER"} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <Input name="reason" placeholder="Reason" required />
                <Button type="submit">Save role</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Adjust credits</CardTitle></CardHeader>
            <CardContent>
              <form action={adminAdjustCredits} className="grid gap-3">
                <input type="hidden" name="userId" value={user.id} />
                <Input name="amount" type="number" placeholder="Amount, e.g. 5 or -2" required />
                <Input name="reason" placeholder="Reason" required />
                <Button type="submit">Adjust credits</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Suspend access</CardTitle></CardHeader>
            <CardContent>
              <form action={adminChangeUserStatus} className="grid gap-3">
                <input type="hidden" name="userId" value={user.id} />
                <select name="status" defaultValue={user.status} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
                <Input name="reason" placeholder="Reason" required />
                <Button type="submit" variant="outline">Save status</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
