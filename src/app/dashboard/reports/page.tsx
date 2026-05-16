import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";

import { ReportShareManager } from "@/components/reports/report-share-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { canUseReportSharing, getUserCredits } from "@/lib/billing";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Reports",
  description: "Reports placeholder.",
};

export default async function ReportsPage() {
  const user = await requireUser();
  const prisma = getPrisma();
  const [reports, credits, clients, shareEnabled] = await Promise.all([
    prisma.report.findMany({
      where: {
        status: "GENERATED",
        userId: user.id,
      },
      include: {
        client: {
          select: {
            companyName: true,
            id: true,
            name: true,
          },
        },
        scan: {
          select: {
            client: {
              select: {
                companyName: true,
                id: true,
                name: true,
              },
            },
            grade: true,
            rootDomain: true,
            scanType: true,
            score: true,
          },
        },
        shares: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            createdAt: true,
            expiresAt: true,
            id: true,
            isActive: true,
            lastViewedAt: true,
            title: true,
            token: true,
            viewCount: true,
          },
        },
        user: {
          select: {
            agencyProfile: {
              select: {
                agencyName: true,
              },
            },
          },
        },
      },
      orderBy: {
        generatedAt: "desc",
      },
    }),
    getUserCredits(user.id),
    prisma.client.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        companyName: true,
        id: true,
        name: true,
      },
    }),
    canUseReportSharing(user.id),
  ]);

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Reports"
        title="Reports"
        description={`Generated PDF reports from completed scans. ${credits.creditsRemaining} report credits remaining.`}
      />
      {reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" aria-hidden="true" />}
          title="No reports yet"
          description="Generate a PDF from a completed scan to see it here."
        />
      ) : (
        <div className="grid min-w-0 gap-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="break-words">
                    {report.scan.rootDomain}
                  </CardTitle>
                  <CardDescription>
                    Generated{" "}
                    {report.generatedAt
                      ? new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(report.generatedAt)
                      : "-"}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {report.reportType === "WHITE_LABEL" ? (
                    <Badge variant="success">Branded</Badge>
                  ) : null}
                  <Badge variant="secondary">{report.scan.scanType}</Badge>
                  <Badge variant="outline">
                    {report.scan.score ?? "Pending"}/100
                  </Badge>
                  <Badge variant="secondary">{report.scan.grade ?? "Pending"}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <p className="min-w-0 break-words">
                    Client:{" "}
                    <span className="font-medium text-foreground">
                      {report.client?.companyName ??
                        report.client?.name ??
                        report.scan.client?.companyName ??
                        report.scan.client?.name ??
                        report.clientName ??
                        "Not assigned"}
                    </span>
                  </p>
                  <p>
                    Domain:{" "}
                    <span className="font-medium text-foreground">
                      {report.scan.rootDomain}
                    </span>
                  </p>
                  <p>
                    Score:{" "}
                    <span className="font-medium text-foreground">
                      {report.scan.score ?? "Pending"}/100
                    </span>
                  </p>
                  <p>
                    Grade:{" "}
                    <span className="font-medium text-foreground">
                      {report.scan.grade ?? "Pending"}
                    </span>
                  </p>
                </div>
                {report.reportType === "WHITE_LABEL" ? (
                  <p className="mb-3 min-w-0 break-words text-sm text-muted-foreground">
                    Agency: {report.user.agencyProfile?.agencyName ?? "Agency"}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href={`/api/reports/${report.id}/download`}>
                      <Download className="size-4" aria-hidden="true" />
                      Download PDF
                    </a>
                  </Button>
                  <ReportShareManager
                    clients={clients}
                    initialShares={report.shares}
                    reportId={report.id}
                    shareEnabled={shareEnabled && report.scan.scanType === "PROFESSIONAL"}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
