import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PublicPricingCards } from "@/components/marketing/public-pricing-cards";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SectionHeading } from "@/components/ui/section-heading";
import { getPublicPricingContent } from "@/lib/marketing/public-pricing";

async function PricingPreview() {
  const pricing = await getPublicPricingContent();

  return (
    <section className="border-y border-border bg-card py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple plans for website security posture reports"
          description="Start with a free basic scan, then request manual payment from your dashboard when you need PDF reports, agency features, or manual review."
          actions={
            <Button asChild variant="outline">
              <Link href="/pricing">
                View pricing
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        />
        <PublicPricingCards plans={pricing.plans} />

        <div className="mt-6 grid gap-3">
          <Alert>
            <AlertTitle>Payment flow</AlertTitle>
            <AlertDescription>{pricing.paymentMessage}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">{pricing.cardPaymentMessage}</p>
        </div>
      </div>
    </section>
  );
}

export { PricingPreview };
