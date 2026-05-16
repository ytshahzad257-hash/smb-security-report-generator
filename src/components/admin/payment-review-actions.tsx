"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import {
  approvePendingPaymentRequest,
  rejectPendingPaymentRequest,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton({
  label,
  pendingLabel,
  variant = "default",
  icon,
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "destructive" | "outline";
  icon: "approve" | "reject";
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : icon === "approve" ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <XCircle aria-hidden="true" />
      )}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function PaymentReviewActions({ requestId }: { requestId: string }) {
  return (
    <div className="grid gap-3">
      <form action={approvePendingPaymentRequest}>
        <input type="hidden" name="requestId" value={requestId} />
        <SubmitButton label="Approve" pendingLabel="Approving..." icon="approve" />
      </form>

      <form action={rejectPendingPaymentRequest} className="grid gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <Textarea
          name="adminNote"
          placeholder="Reason for rejection"
          rows={2}
          required
          maxLength={1000}
        />
        <SubmitButton
          label="Reject"
          pendingLabel="Rejecting..."
          icon="reject"
          variant="destructive"
        />
      </form>
    </div>
  );
}

export { PaymentReviewActions };
