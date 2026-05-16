import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

function SampleReportCta() {
  return (
    <section className="bg-background py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-lg border border-border bg-slate-950 p-6 text-white shadow-sm sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex gap-4">
            <div className="hidden size-12 shrink-0 items-center justify-center rounded-md bg-white/10 text-teal-200 sm:flex">
              <FileText className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">
                See the report experience before scan logic arrives
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                The sample page shows the structure for executive summaries,
                findings tables, recommendations, and branded delivery without
                pretending to run a live scan.
              </p>
            </div>
          </div>
          <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/sample-report">
              Open sample report
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export { SampleReportCta };
