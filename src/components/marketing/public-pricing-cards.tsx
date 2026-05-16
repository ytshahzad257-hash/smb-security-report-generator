import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PublicPlanDisplay } from "@/lib/marketing/public-pricing";

type PublicPricingCardsProps = {
  plans: PublicPlanDisplay[];
  showFullLimits?: boolean;
};

function PublicPricingCards({ plans, showFullLimits = false }: PublicPricingCardsProps) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => (
        <Card
          key={plan.slug}
          className={plan.highlighted ? "border-accent shadow-md" : undefined}
        >
          <CardHeader>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="break-words">{plan.name}</CardTitle>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Best for {plan.bestFor.toLowerCase()}
                </p>
              </div>
              {plan.highlighted ? <Badge variant="success">Popular</Badge> : null}
            </div>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div className="grid gap-1">
              <p className="text-3xl font-semibold tracking-normal text-foreground">
                {plan.priceLabel}
              </p>
              <p className="text-sm text-muted-foreground">{plan.billingTypeLabel}</p>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Includes
              </p>
              <ul className="mt-2 grid min-w-0 gap-1.5 text-sm text-foreground">
                {plan.includes.map((line) => (
                  <li key={`${plan.slug}-${line}`} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {showFullLimits ? (
              <details className="rounded-md border border-border bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  View full limits
                </summary>
                <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                  {plan.fullLimits.map((group) => (
                    <div key={`${plan.slug}-${group.title}`} className="grid gap-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        {group.title}
                      </p>
                      {group.lines.map((line) => (
                        <p key={`${plan.slug}-${group.title}-${line}`}>{line}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </CardContent>

          <CardFooter>
            <Button asChild className="w-full">
              <Link href={plan.ctaHref}>{plan.ctaLabel}</Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export { PublicPricingCards };
