"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function StripePortalButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function openPortal() {
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/billing/stripe/portal", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; url?: string }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Stripe billing portal is unavailable.");
      }

      window.location.assign(data.url);
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Stripe billing portal is unavailable.",
      );
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      {error ? (
        <Alert variant="destructive">
          <div>
            <AlertTitle>Billing portal unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </div>
        </Alert>
      ) : null}
      <Button type="button" variant="outline" onClick={openPortal} disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <ExternalLink aria-hidden="true" />
        )}
        {pending ? "Opening..." : "Manage Stripe billing"}
      </Button>
    </div>
  );
}

export { StripePortalButton };
