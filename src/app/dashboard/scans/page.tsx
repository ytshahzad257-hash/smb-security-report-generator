import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Plus, Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Scans",
  description: "Submitted scan history.",
};

function formatDate(date: Date | null) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function statusVariant(status: string) {
  if (status === "COMPLETED") {
    return "success" as const;
  }

  if (status === "FAILED") {
    return "destructive" as const;
  }

  if (status === "RUNNING") {
    return "warning" as const;
  }

  return "outline" as const;
}

export default async function ScansPage() {
  const user = await requireUser();
  const prisma = getPrisma();
  const scans = await prisma.scan.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      targetUrl: true,
      rootDomain: true,
      status: true,
      score: true,
      grade: true,
      scanType: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      _count: {
        select: {
          findings: true,
        },
      },
    },
  });

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Scans"
        title="Scans"
        description="Review submitted targets and open scan detail shells."
        actions={
          <Button asChild>
            <Link href="/dashboard/scans/new">
              <Plus aria-hidden="true" />
              New scan
            </Link>
          </Button>
        }
      />

      {scans.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-5" aria-hidden="true" />}
          title="No scans yet"
          description="Submit a website URL to create a pending scan record."
          action={
            <Button asChild>
              <Link href="/dashboard/scans/new">Submit scan</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {scans.map((scan) => (
            <Card key={scan.id}>
              <CardContent className="grid min-w-0 gap-4 p-5">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold leading-6 text-foreground">
                      {scan.targetUrl}
                    </p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {scan.rootDomain}
                    </p>
                  </div>
                  <Badge
                    variant={statusVariant(scan.status)}
                    className="w-fit shrink-0"
                  >
                    {scan.status}
                  </Badge>
                </div>
                <div>
                  <Badge variant="outline">{scan.scanType}</Badge>
                </div>

                <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    [
                      "Findings",
                      scan.status === "COMPLETED" ? scan._count.findings : "-",
                    ],
                    [
                      "Score",
                      scan.status === "COMPLETED" && scan.score !== null
                        ? `${scan.score}/100`
                        : "Pending",
                    ],
                    [
                      "Grade",
                      scan.status === "COMPLETED" && scan.grade
                        ? scan.grade
                        : "Pending",
                    ],
                    ["Created", formatDate(scan.createdAt)],
                    ["Started", formatDate(scan.startedAt)],
                    ["Completed", formatDate(scan.completedAt)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="min-w-0 rounded-md border border-border bg-background p-3"
                    >
                      <p className="text-muted-foreground">{label}</p>
                      <p className="mt-1 break-words font-semibold text-foreground">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {scan.status === "FAILED" && scan.errorMessage ? (
                  <p className="min-w-0 whitespace-normal break-words text-sm leading-6 text-destructive">
                    {scan.errorMessage}
                  </p>
                ) : null}

                <Button asChild variant="outline" className="w-full sm:w-fit">
                  <Link href={`/dashboard/scans/${scan.id}`}>
                    <FileSearch aria-hidden="true" />
                    View details
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
