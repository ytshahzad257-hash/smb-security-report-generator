import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Billing Cancelled",
  description: "Stripe checkout was cancelled.",
};

export default async function BillingCancelledPage() {
  await requireUser();

  return (
    <EmptyState
      icon={<XCircle className="size-5" aria-hidden="true" />}
      title="Checkout cancelled"
      description="Stripe checkout was cancelled. No Stripe payment was recorded."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard/billing">Back to billing</Link>
        </Button>
      }
    />
  );
}
