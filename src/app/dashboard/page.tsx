import { AlertCircle, CreditCard, FileText, Gauge, WalletCards } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardReportShortcut } from "@/components/dashboard/dashboard-report-shortcut";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requireUser } from "@/lib/auth";
import { getUserSubscription } from "@/lib/billing";
import { getPrisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();
  const subscription = await getUserSubscription(user.id);
  const prisma = getPrisma();
  const [latestCompletedScan, completedScoreAverage, openFindingsCount, criticalHighCount] =
    await Promise.all([
      prisma.scan.findFirst({
        where: {
          score: {
            not: null,
          },
          status: "COMPLETED",
          userId: user.id,
        },
        orderBy: {
          completedAt: "desc",
        },
        select: {
          grade: true,
          score: true,
        },
      }),
      prisma.scan.aggregate({
        _avg: {
          score: true,
        },
        where: {
          score: {
            not: null,
          },
          status: "COMPLETED",
          userId: user.id,
        },
      }),
      prisma.finding.count({
        where: {
          scan: {
            userId: user.id,
          },
          severity: {
            not: "INFO",
          },
        },
      }),
      prisma.finding.count({
        where: {
          scan: {
            userId: user.id,
          },
          severity: {
            in: ["CRITICAL", "HIGH"],
          },
        },
      }),
    ]);
  const averageScore = completedScoreAverage._avg.score;

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Dashboard"
        title="Security posture reports"
        description="Manage website report requests, credits, sample outputs, and client-ready reporting workflows from one responsive workspace."
        actions={
          <Button asChild>
            <Link href="/dashboard/scans/new">New report</Link>
          </Button>
        }
      />

      <Alert variant="info">
        <AlertCircle className="size-4" aria-hidden="true" />
        <div>
          <AlertTitle>Safe posture checks only</AlertTitle>
          <AlertDescription>
            This product is scoped to website configuration checks, risk scoring,
            recommendations, and branded report generation.
          </AlertDescription>
        </div>
      </Alert>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={subscription.plan.name}
          helper={subscription.status}
          icon={<CreditCard className="size-5" aria-hidden="true" />}
        />
        <StatCard
          label="Credits remaining"
          value={String(subscription.creditsRemaining)}
          helper={`${subscription.creditsUsed} used of ${subscription.creditsTotal}`}
          icon={<WalletCards className="size-5" aria-hidden="true" />}
        />
        <StatCard
          label="Latest score"
          value={
            latestCompletedScan?.score !== null &&
            latestCompletedScan?.score !== undefined
              ? `${latestCompletedScan.score}/100`
              : "Pending"
          }
          helper={latestCompletedScan?.grade ? `Grade ${latestCompletedScan.grade}` : "No completed scored scan"}
          icon={<FileText className="size-5" aria-hidden="true" />}
        />
        <StatCard
          label="Average score"
          value={averageScore !== null ? `${Math.round(averageScore)}/100` : "Pending"}
          helper={`${openFindingsCount} open findings, ${criticalHighCount} critical/high`}
          icon={<Gauge className="size-5" aria-hidden="true" />}
        />
      </div>

      <section className="grid min-w-0 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Choose the right scan type
          </h2>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Basic Scan</CardTitle>
              <CardDescription>
                Quick automated website posture check.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <p>
                Includes: HTTP headers, SSL/TLS, email security, basic technology detection, score/grade, basic recommendations.
              </p>
              <p>
                Best for: Free demo, quick checks, single website review.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Professional Scan</CardTitle>
              <CardDescription>
                Client-ready security posture report workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <p>
                Includes: everything in Basic, OWASP checklist, priority remediation, PDF reporting, branding where supported, client sharing, manual review option.
              </p>
              <p>
                Best for: paid users, agencies, client reports.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                <CardTitle>Website report request</CardTitle>
            <CardDescription>
                  Start a safe website scan using the existing request flow.
                </CardDescription>
              </div>
              <Badge variant="outline">Request form</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <DashboardReportShortcut />
          </CardContent>
        </Card>

        <DataTableShell
          caption="Recent reports"
          columns={[
            { key: "website", label: "Website" },
            { key: "status", label: "Status" },
            { key: "score", label: "Risk score" },
            { key: "created", label: "Created" },
          ]}
          emptyState={
            <EmptyState
              icon={<FileText className="size-5" aria-hidden="true" />}
              title="No reports yet"
              description="Generated website posture reports will appear here after the scan engine and queue are implemented."
            />
          }
        />
      </div>
    </div>
  );
}
