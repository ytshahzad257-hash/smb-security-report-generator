import type { Metadata } from "next";
import { Download, LockKeyhole, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SHARE_DISCLAIMER,
  getPublicShareForToken,
} from "@/lib/reports/reportSharing";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared Security Report",
  description: "A read-only shared report link.",
};

function formatDate(date: Date | null) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SafeMessage({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <ShieldCheck className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Report unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
      </section>
    </main>
  );
}

export default async function SharedReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const result = await getPublicShareForToken(token, { countView: true });

  if (result.reason === "inactive") {
    return <SafeMessage message="This report link is no longer active." />;
  }

  if (result.reason === "expired") {
    return <SafeMessage message="This report link has expired." />;
  }

  if (result.reason === "not-found" || !result.share) {
    return <SafeMessage message="The requested report link was not found." />;
  }

  if (result.reason === "password-required") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-foreground">
            Password required
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Enter the report password to view or download this shared report.
          </p>
          <form
            action={`/share/report/${token}/verify-password`}
            className="mt-5 grid gap-3"
            method="post"
          >
            <Input autoComplete="current-password" name="password" type="password" />
            {query.error ? (
              <p className="text-sm text-destructive">
                Password was not accepted. Try again later if attempts are limited.
              </p>
            ) : null}
            <Button type="submit">View report</Button>
          </form>
        </section>
      </main>
    );
  }

  const { report } = result.share;
  const agency = report.user.agencyProfile;
  const accent = agency?.primaryColor ?? agency?.brandColor ?? "#0f172a";
  const brandName = agency?.agencyName ?? siteConfig.name;
  const clientName =
    result.share.client?.companyName ??
    result.share.client?.name ??
    report.clientName ??
    "Client report";

  return (
    <main className="min-h-screen bg-background">
      <section
        className="border-b border-border bg-card"
        style={{ borderTop: `6px solid ${accent}` }}
      >
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {agency?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Agency logo"
                  className="mb-4 max-h-14 max-w-40 object-contain"
                  src={agency.logoUrl}
                />
              ) : null}
              <p className="text-sm font-semibold text-muted-foreground">
                {brandName}
              </p>
              <h1 className="mt-3 break-words text-3xl font-semibold tracking-normal text-foreground">
                {result.share.title ?? "Security posture report"}
              </h1>
              <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                Prepared for {clientName}
              </p>
            </div>
            <Button asChild>
              <a href={`/share/report/${token}/download`}>
                <Download className="size-4" aria-hidden="true" />
                Download PDF
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-border bg-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Target domain</p>
            <p className="mt-2 break-all text-lg font-semibold text-foreground">
              {report.scan.rootDomain}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Score</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {report.scan.score ?? "Pending"}/100
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Grade</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {report.scan.grade ?? "Pending"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-5">
            <p className="text-sm font-medium text-muted-foreground">Generated</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {formatDate(report.generatedAt)}
            </p>
          </div>
        </div>

        <section className="rounded-md border border-border bg-card p-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Automated safe checks</Badge>
            <Badge variant="outline">Read-only shared report</Badge>
            {report.reportType === "WHITE_LABEL" ? (
              <Badge variant="success">Agency branded</Badge>
            ) : null}
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {SHARE_DISCLAIMER}
          </p>
        </section>

        <footer className="grid gap-2 border-t border-border py-5 text-sm text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto]">
          <p className="min-w-0 break-words">
            {agency?.footerText ?? "Prepared for client review"}
          </p>
          <p className="min-w-0 break-words">
            {[agency?.contactEmail, agency?.websiteUrl ?? agency?.website]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </footer>
      </section>
    </main>
  );
}
