"use client";

import { useState, useTransition } from "react";
import { Download, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ReportActionsProps = {
  disabledMessage?: string;
  downloadUrl: string | null;
  generateUrl: string;
  generateLabel?: string;
  generatingLabel?: string;
  hasCredits: boolean;
  isCompleted: boolean;
  noCreditsMessage?: string;
  pdfEnabled?: boolean;
};

export function ReportActions({
  disabledMessage,
  downloadUrl,
  generateUrl,
  generateLabel = "Generate PDF Report",
  generatingLabel = "Generating...",
  hasCredits,
  isCompleted,
  noCreditsMessage = "No report credits available. Please activate a plan or buy credits.",
  pdfEnabled = true,
}: ReportActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currentDownloadUrl, setCurrentDownloadUrl] = useState(downloadUrl);

  async function generateReport() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(generateUrl, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        downloadUrl?: string;
        error?: string;
        success: boolean;
      };

      if (!response.ok || !payload.success || !payload.downloadUrl) {
        setError(payload.error ?? "PDF generation failed.");
        return;
      }

      setCurrentDownloadUrl(payload.downloadUrl);
      router.refresh();
    });
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={generateReport}
          disabled={
            !pdfEnabled ||
            !isCompleted ||
            !hasCredits ||
            isPending ||
            Boolean(currentDownloadUrl)
          }
        >
          <FileText className="size-4" aria-hidden="true" />
          {isPending ? generatingLabel : generateLabel}
        </Button>
        {currentDownloadUrl ? (
          <Button asChild variant="outline">
            <a href={currentDownloadUrl}>
              <Download className="size-4" aria-hidden="true" />
              Download PDF
            </a>
          </Button>
        ) : null}
      </div>
      {!pdfEnabled && !currentDownloadUrl ? (
        <Alert>
          <AlertDescription>
            {disabledMessage ?? "Professional PDF reports are available with Professional Scan."}
          </AlertDescription>
        </Alert>
      ) : null}
      {pdfEnabled && !hasCredits && !currentDownloadUrl ? (
        <Alert>
          <AlertDescription>{noCreditsMessage}</AlertDescription>
        </Alert>
      ) : null}
      {pdfEnabled && !isCompleted ? (
        <p className="text-sm text-muted-foreground">
          PDF reports are available after the scan is completed.
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
