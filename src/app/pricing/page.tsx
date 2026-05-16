import type { Metadata } from "next";
import Link from "next/link";

import { PublicLayout } from "@/components/marketing/public-layout";
import { PublicPricingCards } from "@/components/marketing/public-pricing-cards";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getPublicPricingContent } from "@/lib/marketing/public-pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Public pricing overview for SMB Security Report Generator plans. Plan activation and manual payment requests happen only after login in dashboard billing.",
};

export default async function PricingPage() {
  const pricing = await getPublicPricingContent();

  return (
    <PublicLayout>
      <section className="bg-card py-14 sm:py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Pricing"
            title="Simple plans for website security posture reports"
            description="Start with a free basic scan, then request manual payment from your dashboard when you need PDF reports, agency features, or manual review."
          />
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <PublicPricingCards plans={pricing.plans} showFullLimits />

          <div className="mt-6 grid gap-3">
            <Alert>
              <AlertTitle>Dashboard-only payment flow</AlertTitle>
              <AlertDescription>{pricing.paymentMessage}</AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground">{pricing.cardPaymentMessage}</p>
            {!pricing.isLoggedIn ? (
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login?next=/dashboard/billing" className="underline underline-offset-4">
                  Log in to choose a plan from dashboard billing
                </Link>
                .
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
