"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useActionState, useCallback, useMemo, useState } from "react";

import {
  adminUpdatePlan,
  type AdminPlanUpdateActionState,
} from "@/app/actions/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  billingTypeOptions,
  paymentProviderOptions,
  type NormalizedPlanUpdate,
} from "@/lib/admin-plan-update";
import { formatMoney } from "@/lib/admin-ui";

export type AdminPlanCardModel = {
  id: string;
  slug: string;
  values: NormalizedPlanUpdate;
};

const initialState: AdminPlanUpdateActionState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-destructive">{message}</p>;
}

function getStateError(
  state: AdminPlanUpdateActionState,
  field: string,
) {
  return state.errors?.[field]?.[0];
}

type CheckboxFieldProps = {
  checked: boolean;
  helper?: string;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
};

function CheckboxField({ checked, helper, label, name, onChange }: CheckboxFieldProps) {
  return (
    <label className="grid gap-1 rounded-md border border-border bg-muted/20 p-3">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          checked={checked}
          name={name}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
        {label}
      </span>
      {helper ? <span className="text-xs leading-5 text-muted-foreground">{helper}</span> : null}
    </label>
  );
}

function numberInput(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function PlanEditorCard({ plan }: { plan: AdminPlanCardModel }) {
  const [values, setValues] = useState<NormalizedPlanUpdate>(plan.values);
  const [dirty, setDirty] = useState(false);
  const savePlanAction = useCallback(
    async (previousState: AdminPlanUpdateActionState, formData: FormData) => {
      const nextState = await adminUpdatePlan(previousState, formData);

      if (nextState.status === "success" && nextState.planId === plan.id) {
        setDirty(false);
      }

      return nextState;
    },
    [plan.id],
  );
  const [state, formAction, pending] = useActionState(savePlanAction, initialState);

  const keySummary = useMemo(() => {
    return [
      values.allowBasicScan ? "Basic scan" : null,
      values.allowProfessionalScan ? "Professional scan" : null,
      values.totalReportCredits > 0 ? `${values.totalReportCredits} report credits` : null,
      values.allowManualReview ? "Manual review" : null,
    ]
      .filter(Boolean)
      .join(" | ");
  }, [
    values.allowBasicScan,
    values.allowManualReview,
    values.allowProfessionalScan,
    values.totalReportCredits,
  ]);

  const hasManualReviewAddonShape = plan.slug === "manual-review-addon";

  function update<K extends keyof NormalizedPlanUpdate>(
    field: K,
    updater: NormalizedPlanUpdate[K],
  ) {
    setDirty(true);
    setValues((current) => ({ ...current, [field]: updater }));
  }

  const cardState =
    state.planId === plan.id && state.status ? state.status : undefined;

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{values.name}</span>
          <Badge variant={values.isActive ? "success" : "outline"}>
            {values.isActive ? "ACTIVE" : "INACTIVE"}
          </Badge>
          <span className="text-sm font-normal text-muted-foreground">
            {formatMoney(values.price, values.currency)} / {values.billingType}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {keySummary || "No scan/PDF/manual entitlements enabled yet."}
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="planId" value={plan.id} />

          {cardState === "success" ? (
            <Alert variant="info">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Plan saved</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          {cardState === "error" ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Save failed</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          {cardState === "success" && state.warnings?.length ? (
            <Alert variant="warning">
              <AlertCircle className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Auto-normalized values</AlertTitle>
                <AlertDescription>{state.warnings.join(" ")}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          <details className="rounded-md border border-border bg-card p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Pricing
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`name-${plan.id}`}>
                  Plan name
                </label>
                <Input
                  id={`name-${plan.id}`}
                  name="name"
                  value={values.name}
                  placeholder="Plan name"
                  disabled={pending}
                  onChange={(event) => update("name", event.currentTarget.value)}
                />
                <FieldError message={getStateError(state, "name")} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`price-${plan.id}`}>
                  Price
                </label>
                <Input
                  id={`price-${plan.id}`}
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.price}
                  placeholder="Price in USD"
                  disabled={pending}
                  onChange={(event) => update("price", Number(event.currentTarget.value))}
                />
                <FieldError message={getStateError(state, "price")} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`currency-${plan.id}`}>
                  Currency
                </label>
                <Input
                  id={`currency-${plan.id}`}
                  name="currency"
                  value={values.currency}
                  placeholder="Currency e.g. USD"
                  disabled={pending}
                  onChange={(event) =>
                    update("currency", event.currentTarget.value.toUpperCase())
                  }
                />
                <FieldError message={getStateError(state, "currency")} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`billingType-${plan.id}`}>
                  Billing type
                </label>
                <select
                  id={`billingType-${plan.id}`}
                  name="billingType"
                  value={values.billingType}
                  disabled={pending}
                  onChange={(event) =>
                    update("billingType", event.currentTarget.value as NormalizedPlanUpdate["billingType"])
                  }
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {billingTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <FieldError message={getStateError(state, "billingType")} />
              </div>
              <div className="sm:col-span-2">
                <CheckboxField
                  checked={values.isActive}
                  name="isActive"
                  label="Active plan"
                  onChange={(checked) => update("isActive", checked)}
                />
              </div>
            </div>
          </details>

          <details className="rounded-md border border-border bg-card p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Scan &amp; PDF Limits
            </summary>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckboxField
                  checked={values.allowBasicScan}
                  name="allowBasicScan"
                  label="Allow Basic Scan"
                  onChange={(checked) => update("allowBasicScan", checked)}
                />
                <CheckboxField
                  checked={values.allowProfessionalScan}
                  name="allowProfessionalScan"
                  label="Allow Professional Scan"
                  onChange={(checked) => update("allowProfessionalScan", checked)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`basicScanLimitPerDay-${plan.id}`}>
                    Basic scans per day
                  </label>
                  <Input
                    id={`basicScanLimitPerDay-${plan.id}`}
                    name="basicScanLimitPerDay"
                    type="number"
                    min="0"
                    placeholder="Basic scans per day"
                    value={numberInput(values.basicScanLimitPerDay)}
                    disabled={pending}
                    onChange={(event) =>
                      update("basicScanLimitPerDay", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "basicScanLimitPerDay")} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`professionalScanLimitPerDay-${plan.id}`}>
                    Professional scans per day
                  </label>
                  <Input
                    id={`professionalScanLimitPerDay-${plan.id}`}
                    name="professionalScanLimitPerDay"
                    type="number"
                    min="0"
                    placeholder="Professional scans per day"
                    value={numberInput(values.professionalScanLimitPerDay)}
                    disabled={pending}
                    onChange={(event) =>
                      update("professionalScanLimitPerDay", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "professionalScanLimitPerDay")} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <CheckboxField
                  checked={values.allowBasicPdf}
                  name="allowBasicPdf"
                  label="Allow Basic PDF"
                  onChange={(checked) => update("allowBasicPdf", checked)}
                />
                <CheckboxField
                  checked={values.allowProfessionalPdf}
                  name="allowProfessionalPdf"
                  label="Allow Professional PDF"
                  onChange={(checked) => update("allowProfessionalPdf", checked)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`basicPdfCredits-${plan.id}`}>
                    Basic PDF credits
                  </label>
                  <Input
                    id={`basicPdfCredits-${plan.id}`}
                    name="basicPdfCredits"
                    type="number"
                    min="0"
                    placeholder="Basic PDF credits"
                    value={numberInput(values.basicPdfCredits)}
                    disabled={pending}
                    onChange={(event) =>
                      update("basicPdfCredits", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "basicPdfCredits")} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`professionalPdfCredits-${plan.id}`}>
                    Professional PDF credits
                  </label>
                  <Input
                    id={`professionalPdfCredits-${plan.id}`}
                    name="professionalPdfCredits"
                    type="number"
                    min="0"
                    placeholder="Professional PDF credits"
                    value={numberInput(values.professionalPdfCredits)}
                    disabled={pending}
                    onChange={(event) =>
                      update("professionalPdfCredits", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "professionalPdfCredits")} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`totalReportCredits-${plan.id}`}>
                    Total report credits
                  </label>
                  <Input
                    id={`totalReportCredits-${plan.id}`}
                    name="totalReportCredits"
                    type="number"
                    min="0"
                    placeholder="Total report credits"
                    value={numberInput(values.totalReportCredits)}
                    disabled={pending}
                    onChange={(event) =>
                      update("totalReportCredits", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "totalReportCredits")} />
                </div>
              </div>
            </div>
          </details>

          <details className="rounded-md border border-border bg-card p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Manual Review
            </summary>
            <div className="mt-4 grid gap-4">
              <CheckboxField
                checked={values.allowManualReview}
                name="allowManualReview"
                label="Allow manual review"
                helper="Light manual review = short human review summary. Deep manual review = detailed review for an existing generated report."
                onChange={(checked) => update("allowManualReview", checked)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`lightManualReviewCredits-${plan.id}`}>
                    Light manual review credits
                  </label>
                  <Input
                    id={`lightManualReviewCredits-${plan.id}`}
                    name="lightManualReviewCredits"
                    type="number"
                    min="0"
                    placeholder="Light review credits"
                    value={numberInput(values.lightManualReviewCredits)}
                    disabled={pending}
                    onChange={(event) =>
                      update("lightManualReviewCredits", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "lightManualReviewCredits")} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor={`deepManualReviewCredits-${plan.id}`}>
                    Deep manual review credits
                  </label>
                  <Input
                    id={`deepManualReviewCredits-${plan.id}`}
                    name="deepManualReviewCredits"
                    type="number"
                    min="0"
                    placeholder="Deep review credits"
                    value={numberInput(values.deepManualReviewCredits)}
                    disabled={pending}
                    onChange={(event) =>
                      update("deepManualReviewCredits", Number(event.currentTarget.value))
                    }
                  />
                  <FieldError message={getStateError(state, "deepManualReviewCredits")} />
                </div>
              </div>
              <CheckboxField
                checked={values.allowPriorityGuidance}
                name="allowPriorityGuidance"
                label="Allow priority guidance"
                helper="Priority guidance means support guidance, not unlimited deep manual reviews."
                onChange={(checked) => update("allowPriorityGuidance", checked)}
              />
              {hasManualReviewAddonShape ? (
                <p className="text-sm text-muted-foreground">
                  Manual Review Add-on should normally keep Deep manual review credits at 1, with no scan or PDF credits.
                </p>
              ) : null}
            </div>
          </details>

          <details className="rounded-md border border-border bg-card p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Feature Access
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CheckboxField
                checked={values.allowWhiteLabel}
                name="allowWhiteLabel"
                label="White-label branding"
                helper="White-label controls report/client branding."
                onChange={(checked) => update("allowWhiteLabel", checked)}
              />
              <CheckboxField
                checked={values.allowAgencyBranding}
                name="allowAgencyBranding"
                label="Agency branding"
                onChange={(checked) => update("allowAgencyBranding", checked)}
              />
              <CheckboxField
                checked={values.allowClientManagement}
                name="allowClientManagement"
                label="Client management"
                onChange={(checked) => update("allowClientManagement", checked)}
              />
              <CheckboxField
                checked={values.allowShareLinks}
                name="allowShareLinks"
                label="Secure share links"
                helper="Share links allow secure client-facing report sharing."
                onChange={(checked) => update("allowShareLinks", checked)}
              />
              <CheckboxField
                checked={values.allowHidePoweredBy}
                name="allowHidePoweredBy"
                label="Hide powered-by branding"
                helper="Usually reserved for higher agency plans."
                onChange={(checked) => update("allowHidePoweredBy", checked)}
              />
              <CheckboxField
                checked={values.allowPrioritySupport}
                name="allowPrioritySupport"
                label="Priority support"
                onChange={(checked) => update("allowPrioritySupport", checked)}
              />
            </div>
          </details>

          <details className="rounded-md border border-border bg-card p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Payment Provider IDs
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`preferredPaymentProvider-${plan.id}`}>
                  Preferred payment provider
                </label>
                <select
                  id={`preferredPaymentProvider-${plan.id}`}
                  name="preferredPaymentProvider"
                  value={values.preferredPaymentProvider}
                  disabled={pending}
                  onChange={(event) =>
                    update(
                      "preferredPaymentProvider",
                      event.currentTarget.value as NormalizedPlanUpdate["preferredPaymentProvider"],
                    )
                  }
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {paymentProviderOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <FieldError message={getStateError(state, "preferredPaymentProvider")} />
              </div>
              <CheckboxField
                checked={values.stripeEnabled}
                name="stripeEnabled"
                label="Stripe enabled"
                onChange={(checked) => update("stripeEnabled", checked)}
              />
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`stripeProductId-${plan.id}`}>
                  Stripe product ID
                </label>
                <Input
                  id={`stripeProductId-${plan.id}`}
                  name="stripeProductId"
                  placeholder="Stripe product ID"
                  value={values.stripeProductId ?? ""}
                  disabled={pending}
                  onChange={(event) => update("stripeProductId", event.currentTarget.value)}
                />
                <FieldError message={getStateError(state, "stripeProductId")} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`stripePriceId-${plan.id}`}>
                  Stripe price ID
                </label>
                <Input
                  id={`stripePriceId-${plan.id}`}
                  name="stripePriceId"
                  placeholder="Stripe price ID"
                  value={values.stripePriceId ?? ""}
                  disabled={pending}
                  onChange={(event) => update("stripePriceId", event.currentTarget.value)}
                />
                <FieldError message={getStateError(state, "stripePriceId")} />
              </div>
              <CheckboxField
                checked={values.lemonEnabled}
                name="lemonEnabled"
                label="Lemon enabled"
                onChange={(checked) => update("lemonEnabled", checked)}
              />
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`lemonProductId-${plan.id}`}>
                  Lemon product ID
                </label>
                <Input
                  id={`lemonProductId-${plan.id}`}
                  name="lemonProductId"
                  placeholder="Lemon product ID"
                  value={values.lemonProductId ?? ""}
                  disabled={pending}
                  onChange={(event) => update("lemonProductId", event.currentTarget.value)}
                />
                <FieldError message={getStateError(state, "lemonProductId")} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`lemonVariantId-${plan.id}`}>
                  Lemon variant ID
                </label>
                <Input
                  id={`lemonVariantId-${plan.id}`}
                  name="lemonVariantId"
                  placeholder="Lemon variant ID"
                  value={values.lemonVariantId ?? ""}
                  disabled={pending}
                  onChange={(event) => update("lemonVariantId", event.currentTarget.value)}
                />
                <FieldError message={getStateError(state, "lemonVariantId")} />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Provider IDs are allowed here. Secret keys are not shown on this page.
            </p>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-4">
            <div className="text-sm text-muted-foreground">
              {dirty ? "Unsaved changes." : "No unsaved changes."}
              {cardState === "success" && state.changedFields?.length
                ? ` Updated fields: ${state.changedFields.join(", ")}.`
                : null}
            </div>
            <Button
              type="submit"
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {pending ? "Saving..." : "Save plan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export { PlanEditorCard };
