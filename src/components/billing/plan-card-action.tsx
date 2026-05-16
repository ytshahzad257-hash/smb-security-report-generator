"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LemonCheckoutButton } from "@/components/billing/lemon-checkout-button";

type PlanCardActionProps = {
  isCurrent: boolean;
  planId: string;
  planName: string;
  lemonConfigured: boolean;
  lemonReady: boolean;
  lemonMode: "payment" | "subscription";
  unavailableMessage: string;
  noCheckout?: boolean;
};

function PlanCardAction({
  isCurrent,
  planId,
  planName,
  lemonConfigured,
  lemonReady,
  lemonMode,
  unavailableMessage,
  noCheckout = false,
}: PlanCardActionProps) {
  if (isCurrent) {
    return (
      <div className="mt-auto grid gap-2">
        <Button type="button" className="w-full" disabled>
          Current plan
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          This plan is active on your account.
        </p>
      </div>
    );
  }

  if (noCheckout) {
    return (
      <div className="mt-auto grid gap-2">
        <Button type="button" className="w-full" variant="outline" disabled>
          No checkout required
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Free Demo is available without a paid checkout.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-auto grid gap-3">
      <LemonCheckoutButton
        planId={planId}
        label={
          lemonMode === "subscription" ? "Subscribe with Card" : "Pay with Card"
        }
        disabled={!lemonReady}
        unavailableMessage={
          lemonConfigured
            ? `${planName} is not mapped to a Lemon Squeezy variant yet.`
            : unavailableMessage
        }
      />
      {!lemonReady ? (
        <Alert variant="info">
          <div>
            <AlertTitle>Manual payment is available</AlertTitle>
            <AlertDescription>
              You can still submit a manual payment request for this plan.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}
    </div>
  );
}

export { PlanCardAction };
