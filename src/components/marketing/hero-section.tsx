import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Globe2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const previewChecks = [
  "HTTP security headers",
  "HTTPS and TLS basics",
  "SPF, DMARC, MX, DKIM selectors",
  "Safe exposed path review",
];

function HeroSection() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="min-w-0 max-w-4xl">
          <Badge variant="outline" className="mb-5">
            Safe website posture reporting for SMBs
          </Badge>
          <h1 className="text-4xl font-semibold tracking-normal text-foreground sm:text-5xl lg:text-6xl">
            SMB Security Report Generator
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            Create polished, branded website security posture reports from safe
            configuration checks, mapped recommendations, and a clear risk
            score clients can understand.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sample-report">
                View sample report
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
          <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="border-b border-border bg-slate-950 p-6 text-white lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 text-sm font-medium text-teal-200">
                <ShieldCheck className="size-4" aria-hidden="true" />
                Report workflow preview
              </div>
              <div className="mt-8 grid gap-4">
                <div className="rounded-md border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300">Website URL</p>
                      <p className="mt-1 break-words font-semibold">client-domain.com</p>
                    </div>
                    <Globe2 className="size-5 text-teal-200" aria-hidden="true" />
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300">Output</p>
                      <p className="mt-1 font-semibold">Branded PDF report</p>
                    </div>
                    <FileText className="size-5 text-teal-200" aria-hidden="true" />
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-300">Boundary</p>
                      <p className="mt-1 font-semibold">Safe checks only</p>
                    </div>
                    <LockKeyhole className="size-5 text-teal-200" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Included check categories
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-normal">
                    Report-ready posture summary
                  </h2>
                </div>
                <Badge variant="success">Preview</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {previewChecks.map((check) => (
                  <div
                    key={check}
                    className="flex min-h-24 items-start gap-3 rounded-md border border-border bg-background p-4"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-5 shrink-0 text-accent-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-medium leading-6 text-foreground">
                      {check}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-md border border-border bg-muted/50 p-4">
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Risk scoring and recommendations
                  </p>
                  <span className="text-sm font-semibold text-accent-foreground">
                    Recommendations
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 rounded-full bg-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { HeroSection };
