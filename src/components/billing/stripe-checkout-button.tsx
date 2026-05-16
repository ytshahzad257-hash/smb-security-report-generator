"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type StripeCheckoutButtonProps = {
  planId?: string;
  packageId?: string;
  label: string;
  disabled?: boolean;
  unavailableMessage?: string;
};

function StripeCheckoutButton({
  planId,
  packageId,
  label,
  disabled = false,
  unavailableMessage,
}: StripeCheckoutButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function startCheckout() {
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/billing/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, packageId }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; url?: string }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(data?.error ?? "Checkout session creation failed.");
      }

      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Checkout session creation failed.",
      );
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      {error ? (
        <Alert variant="destructive">
          <div>
            <AlertTitle>Stripe checkout failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </div>
        </Alert>
      ) : null}
      <Button
        type="button"
        className="w-full"
        onClick={startCheckout}
        disabled={pending || disabled}
        title={disabled ? unavailableMessage : undefined}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard aria-hidden="true" />
        )}
        {pending ? "Opening Stripe..." : label}
      </Button>
      {disabled && unavailableMessage ? (
        <p className="text-xs leading-5 text-muted-foreground">{unavailableMessage}</p>
      ) : null}
    </div>
  );
}

export { StripeCheckoutButton };
