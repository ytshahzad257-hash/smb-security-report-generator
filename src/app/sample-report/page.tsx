import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  FileText,
  MailCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { PublicLayout } from "@/components/marketing/public-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { StatCard } from "@/components/ui/stat-card";
import {
  sampleFindings,
  sampleHeaderSummary,
  sampleReportData,
  sampleReportDisclaimer,
} from "@/lib/reports/sampleReportData";

export const metadata: Metadata = {
  title: "Sample Website Security Report | SMB Security Report Generator",
  description:
    "Preview a demo website security posture report with sample findings, safe automated check sections, and a downloadable sample PDF.",
};

const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

function severityVariant(severity: string) {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "destructive" as const;
  }

  if (severity === "MEDIUM") {
    return "warning" as const;
  }

  if (severity === "INFO") {
    return "secondary" as const;
  }

  return "outline" as const;
}

function statusVariant(status: string) {
  if (status === "Present" || status === "Valid" || status === "Available") {
    return "success" as const;
  }

  if (status === "Missing" || status === "Reachable") {
    return "destructive" as const;
  }

  if (status === "Weak" || status === "OBSERVATION") {
    return "warning" as const;
  }

  return "outline" as const;
}

function CtaBand() {
  return (
    <section className="rounded-md border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold tracking-normal text-foreground">
            Generate a report for your own site
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Sign up to run safe automated checks, or review pricing and manual
            payment options for existing teams.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/signup">
              Start free scan <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function SampleReportPage() {
  const { emailSummary, scan, severityCounts, sslSummary, techSummary } =
    sampleReportData;
  const totalFindings = sampleFindings.length;
  const remediationItems = [
    ...(sampleReportData.remediationSummary?.immediateAttention ?? []),
    ...(sampleReportData.remediationSummary?.recommendedHardening ?? []),
  ];

  return (
    <PublicLayout>
      <div className="sticky top-16 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-muted-foreground">
            Demo target:{" "}
            <span className="break-all text-foreground">{scan.rootDomain}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="sm">
              <Link href="/signup">Generate your report</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/sample-report/download">
                <Download aria-hidden="true" /> Download sample PDF
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <section className="bg-card py-12 sm:py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <div className="min-w-0">
            <Badge variant="secondary">Sample report</Badge>
            <h1 className="mt-5 max-w-4xl break-words text-3xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Website security posture report preview
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              See the type of report the product generates using static demo
              data only. This page does not run scans, create records, use
              private report data, or deduct credits.
            </p>
            <div className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start free scan <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/pricing">View pricing</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/signup">Create account</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/dashboard/billing">Contact / manual payment</Link>
              </Button>
            </div>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="break-words">{scan.rootDomain}</CardTitle>
              <CardDescription>
                SAMPLE/DEMO report generated from static data.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Score
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-normal">
                    {scan.score}/100
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Grade
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-normal">
                    {scan.grade}
                  </p>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link href="/sample-report/download">
                  <Download aria-hidden="true" /> Download sample PDF
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-6 px-4 sm:px-6 lg:px-8">
          <Alert variant="warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <div>
              <AlertTitle>Demo data only</AlertTitle>
              <AlertDescription>{sampleReportDisclaimer}</AlertDescription>
            </div>
          </Alert>

          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Target domain"
              value={scan.rootDomain}
              helper="Static demo target"
              icon={<FileText className="size-5" aria-hidden="true" />}
            />
            <StatCard
              label="Score / grade"
              value={`${scan.score}/100 ${scan.grade}`}
              helper="SAMPLE/DEMO posture summary"
              icon={<ShieldCheck className="size-5" aria-hidden="true" />}
            />
            <StatCard
              label="Total findings"
              value={String(totalFindings)}
              helper="Every finding is labeled sample/demo"
              icon={<AlertTriangle className="size-5" aria-hidden="true" />}
            />
            <StatCard
              label="Check groups"
              value="5"
              helper="Headers, SSL/TLS, email, tech, OWASP preview"
              icon={<Sparkles className="size-5" aria-hidden="true" />}
            />
          </div>

          <DataTableShell
            caption="Severity breakdown"
            columns={[
              { key: "severity", label: "Severity" },
              { key: "count", label: "Count" },
              { key: "note", label: "Demo note" },
            ]}
            rows={severityOrder.map((severity) => ({
              count: severityCounts[severity],
              note:
                severity === "INFO"
                  ? "Displayed as an observation in this sample."
                  : "Static demo count only.",
              severity: (
                <Badge variant={severityVariant(severity)}>{severity}</Badge>
              ),
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle>Basic vs Professional Scan</CardTitle>
              <CardDescription>
                High-level product comparison for choosing report depth.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                ["HTTP security headers", "Yes", "Yes"],
                ["SSL/TLS checks", "Yes", "Yes"],
                ["Email security DNS", "Yes", "Yes"],
                ["Basic tech detection", "Yes", "Yes"],
                ["Risk score/grade", "Yes", "Yes"],
                ["OWASP checklist", "Basic overview", "Full"],
                ["Priority remediation summary", "Basic recommendations", "Full priority summary"],
                ["PDF report", "Basic PDF / limited report", "Professional PDF"],
              ].map(([feature, basic, professional]) => (
                <article
                  key={feature}
                  className="grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <p className="text-sm font-medium text-foreground">{feature}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Basic:</span> {basic}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Professional:</span> {professional}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Executive summary</CardTitle>
              <CardDescription>
                Written for client-friendly review without overstating scope.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground">
              <p>
                SAMPLE/DEMO: The demo site has a moderate posture score because
                several browser and email hardening controls are missing or
                weak. HTTPS is available and the certificate appears valid in
                this static preview.
              </p>
              <p>
                The highest-priority items are adding Content-Security-Policy,
                publishing DMARC, improving HSTS duration, and reviewing whether
                XML-RPC is required. WordPress indicators are shown as an
                observation, not as proof of compromise.
              </p>
            </CardContent>
          </Card>

          <CtaBand />

          <Card>
            <CardHeader>
              <CardTitle>Sample findings</CardTitle>
              <CardDescription>
                Realistic fake findings. These are not from a live scan.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-4 lg:grid-cols-2">
              {sampleFindings.map((finding) => (
                <article
                  key={finding.id}
                  className="grid min-w-0 gap-4 rounded-md border border-border bg-background p-4"
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-semibold leading-6 text-foreground">
                        {finding.title}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">SAMPLE/DEMO</Badge>
                        <Badge variant="outline">{finding.category}</Badge>
                      </div>
                    </div>
                    <Badge
                      className="w-fit"
                      variant={severityVariant(finding.severity)}
                    >
                      {finding.severity}
                    </Badge>
                  </div>
                  <dl className="grid min-w-0 gap-3">
                    {[
                      ["Evidence", finding.evidence],
                      ["Impact", finding.impact],
                      ["Fix", finding.fix],
                      ["OWASP mapping", finding.owaspMapping ?? "-"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 break-words text-sm leading-6 text-foreground">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HTTP security headers</CardTitle>
              <CardDescription>
                Demo homepage response header posture.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {sampleHeaderSummary.map((header) => (
                  <article
                    key={header.name}
                    className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                  >
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h2 className="break-words text-sm font-semibold leading-6">
                        {header.name}
                      </h2>
                      <Badge
                        className="w-fit"
                        variant={statusVariant(header.status)}
                      >
                        {header.status}
                      </Badge>
                    </div>
                    <p className="break-words text-sm leading-6 text-muted-foreground">
                      {header.findingTitles.length > 0
                        ? header.findingTitles.join(", ")
                        : header.note}
                    </p>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>SSL/TLS</CardTitle>
                <CardDescription>
                  Static HTTPS and certificate preview.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid min-w-0 gap-3">
                  {[
                    ["HTTPS availability", sslSummary?.httpsAvailable ? "Available" : "Not available"],
                    ["HTTP to HTTPS redirect", sslSummary?.httpRedirectsToHttps ? "Yes" : "No"],
                    ["Certificate status", sslSummary?.certificateValid ? "Valid" : "Review needed"],
                    ["Issuer", sslSummary?.issuer ?? "-"],
                    ["Days until expiry", String(sslSummary?.daysUntilExpiry ?? "-")],
                    ["Hostname match", sslSummary?.hostnameMatched ? "Yes" : "No"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid min-w-0 gap-1 rounded-md border border-border bg-background p-3 sm:grid-cols-[11rem_minmax(0,1fr)]"
                    >
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="break-words text-sm text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email security</CardTitle>
                <CardDescription>
                  Demo MX, SPF, DKIM selector, and DMARC posture.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid min-w-0 gap-3">
                  {[
                    [
                      "MX records",
                      emailSummary?.mxRecords
                        .map((record) => `${record.exchange} (${record.priority})`)
                        .join(", ") ?? "-",
                    ],
                    ["SPF", emailSummary?.spfRecord ?? "-"],
                    ["DMARC", emailSummary?.dmarcFound ? "Present" : "Missing"],
                    [
                      "DKIM selector observation",
                      `${emailSummary?.dkimSelectorsFound.length ?? 0} of ${
                        emailSummary?.dkimSelectorsTested.length ?? 0
                      } common selectors observed`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid min-w-0 gap-1 rounded-md border border-border bg-background p-3 sm:grid-cols-[11rem_minmax(0,1fr)]"
                    >
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="break-words text-sm text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <CtaBand />

          <Card>
            <CardHeader>
              <CardTitle>Technology detection</CardTitle>
              <CardDescription>
                Safe public observations shown with demo evidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Technologies", techSummary?.technologiesDetected.join(", ") ?? "-"],
                  ["WordPress", techSummary?.wordpressDetected ? "Observed" : "Not observed"],
                  ["XML-RPC", techSummary?.xmlRpcAccessible ? "Accessible" : "Not accessible"],
                  ["Server header", techSummary?.serverHeader ?? "-"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-md border border-border bg-background p-4"
                  >
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-2 break-words text-sm font-medium leading-6 text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <DataTableShell
            caption="Public path observations"
            columns={[
              { key: "path", label: "Path" },
              { key: "status", label: "Status" },
              { key: "evidence", label: "Evidence" },
            ]}
            rows={(techSummary?.exposedPathChecks ?? []).map((check) => ({
              evidence: check.evidence,
              path: <span className="break-all">{check.path}</span>,
              status: (
                <Badge variant={statusVariant(check.status)}>
                  {check.status}
                </Badge>
              ),
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle>OWASP checklist preview</CardTitle>
              <CardDescription>
                A limited mapping based only on safe automated observations.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-4 lg:grid-cols-3">
              {sampleReportData.owaspChecklistItems.map((item) => (
                <article
                  key={item.categoryName}
                  className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                >
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h2 className="break-words text-sm font-semibold leading-6">
                      {item.categoryName}
                    </h2>
                    <Badge
                      className="w-fit whitespace-normal leading-tight"
                      variant={statusVariant(item.status)}
                    >
                      {item.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="break-words text-sm leading-6 text-muted-foreground">
                    {item.evidenceSummary}
                  </p>
                  <p className="break-words text-sm leading-6 text-foreground">
                    {item.recommendation}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Priority remediation summary</CardTitle>
              <CardDescription>
                Demo actions grouped for a first hardening pass.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-3 lg:grid-cols-2">
              {remediationItems.map((item) => (
                <article
                  key={`${item.title}-${item.category}`}
                  className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                >
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-semibold leading-6">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.category}
                      </p>
                    </div>
                    <Badge
                      className="w-fit"
                      variant={severityVariant(item.severity)}
                    >
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="break-words text-sm leading-6 text-foreground">
                    {item.recommendation}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>

          <section className="rounded-md border border-border bg-card p-5 sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MailCheck className="size-4" aria-hidden="true" />
                  Ready to compare this with your own site?
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Create an account, start from pricing, or use the existing
                  manual payment path in the dashboard.
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link href="/signup">Start free scan</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/pricing">View pricing</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/dashboard/billing">Contact / manual payment</Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </PublicLayout>
  );
}
