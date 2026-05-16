"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { submitScanAction, type SubmitScanState } from "@/app/actions/scans";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SubmitScanState = {};

type NewScanFormProps = {
  clients?: Array<{
    companyName: string | null;
    id: string;
    name: string;
  }>;
  initialScanType?: "BASIC" | "PROFESSIONAL";
  initialTargetUrl?: string;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

function NewScanForm({
  clients = [],
  initialScanType = "BASIC",
  initialTargetUrl = "",
}: NewScanFormProps) {
  const [scanType, setScanType] = useState<"BASIC" | "PROFESSIONAL">(initialScanType);
  const [showComparison, setShowComparison] = useState(false);
  const [state, formAction, pending] = useActionState(
    submitScanAction,
    initialState,
  );
  const isProfessional = scanType === "PROFESSIONAL";
  const scanHelperText = useMemo(
    () =>
      isProfessional
        ? "Professional Scan creates a client-ready report with OWASP checklist, remediation summary, PDF workflow, branding, and sharing options based on your plan."
        : "Basic Scan runs quick automated checks for HTTP headers, SSL/TLS, email security, and basic technology indicators.",
    [isProfessional],
  );

  return (
    <form action={formAction} className="grid gap-4">
      {state.message ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <div>
            <AlertTitle>Scan not submitted</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="targetUrl">
          Website URL
        </label>
        <Input
          id="targetUrl"
          name="targetUrl"
          placeholder="https://example.com"
          defaultValue={initialTargetUrl}
          disabled={pending}
          aria-invalid={Boolean(state.errors?.targetUrl)}
          aria-describedby="targetUrl-help"
        />
        <p id="targetUrl-help" className="text-sm leading-6 text-muted-foreground">
          Avoid login portals, mail apps, admin panels, and authenticated
          dashboards. Scan the public website domain.
        </p>
        <FieldError errors={state.errors?.targetUrl} />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor="scanType">
          Scan type
        </label>
        <Select
          name="scanType"
          value={scanType}
          onValueChange={(value) => setScanType(value as "BASIC" | "PROFESSIONAL")}
          disabled={pending}
        >
          <SelectTrigger id="scanType" aria-invalid={Boolean(state.errors?.scanType)}>
            <SelectValue placeholder="Select scan type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BASIC">Basic</SelectItem>
            <SelectItem value="PROFESSIONAL">Professional</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm leading-6 text-muted-foreground">{scanHelperText}</p>
        <FieldError errors={state.errors?.scanType} />
      </div>

      <div className="rounded-md border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">
            Basic vs Professional Scan
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowComparison((current) => !current)}
          >
            {showComparison ? "Hide comparison" : "View full comparison"}
          </Button>
        </div>
        {showComparison ? (
          <div className="mt-4 grid gap-3">
            {[
              ["HTTP security headers", "Yes", "Yes"],
              ["SSL/TLS checks", "Yes", "Yes"],
              ["Email security DNS", "Yes", "Yes"],
              ["Basic tech detection", "Yes", "Yes"],
              ["Risk score/grade", "Yes", "Yes"],
              ["OWASP checklist", "Basic overview", "Full"],
              ["Priority remediation summary", "Basic recommendations", "Full priority summary"],
              ["PDF report", "Basic PDF / limited report", "Professional PDF"],
              ["Agency branding", "No", "Plan-based"],
              ["Client assignment", "No / optional", "Yes"],
              ["Share link", "No / limited", "Yes"],
              ["Manual review", "No", "Add-on / Pro only"],
            ].map(([feature, basic, professional]) => (
              <article
                key={feature}
                className="grid gap-2 rounded-md border border-border bg-card p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-start"
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
          </div>
        ) : null}
      </div>

      {isProfessional ? (
        <>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="clientId">
              Existing client <span className="text-muted-foreground">(optional)</span>
            </label>
            <Select name="clientId" defaultValue="__none" disabled={pending}>
              <SelectTrigger id="clientId" aria-invalid={Boolean(state.errors?.clientId)}>
                <SelectValue placeholder="No client selected" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No client selected</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.companyName
                      ? `${client.name} - ${client.companyName}`
                      : client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={state.errors?.clientId} />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="clientName">
              Manual client name <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="clientName"
              name="clientName"
              placeholder="Acme Co."
              disabled={pending}
              aria-invalid={Boolean(state.errors?.clientName)}
            />
            <FieldError errors={state.errors?.clientName} />
          </div>
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Basic Scan keeps this workflow focused on automated checks. Client assignment is available with Professional Scan.
        </p>
      )}

      <Button type="submit" className="w-full sm:w-fit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {pending ? "Submitting..." : "Submit scan"}
      </Button>
    </form>
  );
}

export { NewScanForm };
