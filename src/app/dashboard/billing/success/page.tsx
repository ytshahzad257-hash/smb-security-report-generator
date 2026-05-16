import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Billing Success",
  description: "Stripe payment received.",
};

export default async function BillingSuccessPage() {
  await requireUser();

  return (
    <EmptyState
      icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
      title="Stripe confirmation pending"
      description="Payment received by Stripe. Your access will update after confirmation."
      action={
        <Button asChild>
          <Link href="/dashboard/billing">Back to billing</Link>
        </Button>
      }
    />
  );
}
