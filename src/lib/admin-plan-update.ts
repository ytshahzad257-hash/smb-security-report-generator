import type { Plan } from "@prisma/client";
import { z } from "zod";

const billingTypeSchema = z.enum(["FREE", "ONE_TIME", "MONTHLY", "ADDON"]);
const paymentProviderSchema = z.enum(["MANUAL", "STRIPE", "LEMON"]);

const basePlanUpdateSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required.").max(120),
  price: z.coerce.number().min(0, "Price must be 0 or greater."),
  currency: z.string().trim().min(1, "Currency is required.").max(12),
  billingType: billingTypeSchema,
  isActive: z.boolean(),
  allowBasicScan: z.boolean(),
  allowProfessionalScan: z.boolean(),
  basicScanLimitPerDay: z.coerce
    .number()
    .int("Basic scans per day must be a whole number.")
    .min(0, "Basic scans per day must be 0 or greater."),
  professionalScanLimitPerDay: z.coerce
    .number()
    .int("Professional scans per day must be a whole number.")
    .min(0, "Professional scans per day must be 0 or greater."),
  allowBasicPdf: z.boolean(),
  allowProfessionalPdf: z.boolean(),
  basicPdfCredits: z.coerce
    .number()
    .int("Basic PDF credits must be a whole number.")
    .min(0, "Basic PDF credits must be 0 or greater."),
  professionalPdfCredits: z.coerce
    .number()
    .int("Professional PDF credits must be a whole number.")
    .min(0, "Professional PDF credits must be 0 or greater."),
  totalReportCredits: z.coerce
    .number()
    .int("Total report credits must be a whole number.")
    .min(0, "Total report credits must be 0 or greater."),
  allowManualReview: z.boolean(),
  lightManualReviewCredits: z.coerce
    .number()
    .int("Light manual review credits must be a whole number.")
    .min(0, "Light manual review credits must be 0 or greater."),
  deepManualReviewCredits: z.coerce
    .number()
    .int("Deep manual review credits must be a whole number.")
    .min(0, "Deep manual review credits must be 0 or greater."),
  allowPriorityGuidance: z.boolean(),
  allowWhiteLabel: z.boolean(),
  allowAgencyBranding: z.boolean(),
  allowClientManagement: z.boolean(),
  allowShareLinks: z.boolean(),
  allowHidePoweredBy: z.boolean(),
  allowPrioritySupport: z.boolean(),
  preferredPaymentProvider: paymentProviderSchema,
  stripeEnabled: z.boolean(),
  stripeProductId: z.string().trim().max(255).optional(),
  stripePriceId: z.string().trim().max(255).optional(),
  lemonEnabled: z.boolean(),
  lemonProductId: z.string().trim().max(255).optional(),
  lemonVariantId: z.string().trim().max(255).optional(),
});

export type NormalizedPlanUpdate = z.infer<typeof basePlanUpdateSchema>;

export type NormalizedPlanResult = {
  data: NormalizedPlanUpdate;
  warnings: string[];
};

export type NormalizedPlanParseResult =
  | {
      success: true;
      data: NormalizedPlanUpdate;
      warnings: string[];
    }
  | {
      success: false;
      errors: Record<string, string[]>;
    };

const AUDIT_FIELDS = [
  "name",
  "price",
  "currency",
  "billingType",
  "isActive",
  "allowBasicScan",
  "allowProfessionalScan",
  "basicScanLimitPerDay",
  "professionalScanLimitPerDay",
  "allowBasicPdf",
  "allowProfessionalPdf",
  "basicPdfCredits",
  "professionalPdfCredits",
  "totalReportCredits",
  "allowManualReview",
  "lightManualReviewCredits",
  "deepManualReviewCredits",
  "allowPriorityGuidance",
  "allowWhiteLabel",
  "allowAgencyBranding",
  "allowClientManagement",
  "allowShareLinks",
  "allowHidePoweredBy",
  "allowPrioritySupport",
  "preferredPaymentProvider",
  "stripeEnabled",
  "stripeProductId",
  "stripePriceId",
  "lemonEnabled",
  "lemonProductId",
  "lemonVariantId",
  "reportCredits",
  "whiteLabelEnabled",
  "clientManagementEnabled",
  "shareLinkEnabled",
  "manualReviewEnabled",
  "isStripeEnabled",
] as const;

type AuditField = (typeof AUDIT_FIELDS)[number];

function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

export function buildPlanUpdateInputFromPlan(plan: Plan): NormalizedPlanUpdate {
  return {
    name: plan.name,
    price: Number(plan.price),
    currency: plan.currency,
    billingType: plan.billingType,
    isActive: plan.isActive,
    allowBasicScan: plan.allowBasicScan,
    allowProfessionalScan: plan.allowProfessionalScan,
    basicScanLimitPerDay: plan.basicScanLimitPerDay,
    professionalScanLimitPerDay: plan.professionalScanLimitPerDay,
    allowBasicPdf: plan.allowBasicPdf,
    allowProfessionalPdf: plan.allowProfessionalPdf,
    basicPdfCredits: plan.basicPdfCredits,
    professionalPdfCredits: plan.professionalPdfCredits,
    totalReportCredits: plan.totalReportCredits,
    allowManualReview: plan.allowManualReview,
    lightManualReviewCredits: plan.lightManualReviewCredits,
    deepManualReviewCredits: plan.deepManualReviewCredits,
    allowPriorityGuidance: plan.allowPriorityGuidance,
    allowWhiteLabel: plan.allowWhiteLabel,
    allowAgencyBranding: plan.allowAgencyBranding,
    allowClientManagement: plan.allowClientManagement,
    allowShareLinks: plan.allowShareLinks,
    allowHidePoweredBy: plan.allowHidePoweredBy,
    allowPrioritySupport: plan.allowPrioritySupport,
    preferredPaymentProvider:
      plan.preferredPaymentProvider === "STRIPE" ||
      plan.preferredPaymentProvider === "LEMON"
        ? plan.preferredPaymentProvider
        : "MANUAL",
    stripeEnabled: plan.stripeEnabled ?? plan.isStripeEnabled,
    stripeProductId: plan.stripeProductId ?? undefined,
    stripePriceId: plan.stripePriceId ?? undefined,
    lemonEnabled: plan.lemonEnabled,
    lemonProductId: plan.lemonProductId ?? undefined,
    lemonVariantId: plan.lemonVariantId ?? undefined,
  };
}

function normalizePlanUpdate(input: NormalizedPlanUpdate): NormalizedPlanResult {
  const data: NormalizedPlanUpdate = { ...input };
  const warnings: string[] = [];

  if (!data.allowBasicScan && data.basicScanLimitPerDay > 0) {
    data.basicScanLimitPerDay = 0;
    warnings.push("Basic scan limit was reset to 0 because Basic scan is disabled.");
  }

  if (!data.allowProfessionalScan && data.professionalScanLimitPerDay > 0) {
    data.professionalScanLimitPerDay = 0;
    warnings.push(
      "Professional scan limit was reset to 0 because Professional scan is disabled.",
    );
  }

  if (!data.allowBasicPdf && data.basicPdfCredits > 0) {
    data.basicPdfCredits = 0;
    warnings.push("Basic PDF credits were reset to 0 because Basic PDF is disabled.");
  }

  if (!data.allowProfessionalPdf && data.professionalPdfCredits > 0) {
    data.professionalPdfCredits = 0;
    warnings.push(
      "Professional PDF credits were reset to 0 because Professional PDF is disabled.",
    );
  }

  if (!data.allowManualReview) {
    if (data.lightManualReviewCredits > 0) {
      data.lightManualReviewCredits = 0;
      warnings.push(
        "Light manual review credits were reset to 0 because Manual Review is disabled.",
      );
    }

    if (data.deepManualReviewCredits > 0) {
      data.deepManualReviewCredits = 0;
      warnings.push(
        "Deep manual review credits were reset to 0 because Manual Review is disabled.",
      );
    }
  }

  return { data, warnings };
}

export function parsePlanUpdateInput(
  rawValues: Record<string, unknown>,
): NormalizedPlanParseResult {
  const parsed = basePlanUpdateSchema.safeParse({
    ...rawValues,
    stripeProductId: emptyToUndefined(rawValues.stripeProductId),
    stripePriceId: emptyToUndefined(rawValues.stripePriceId),
    lemonProductId: emptyToUndefined(rawValues.lemonProductId),
    lemonVariantId: emptyToUndefined(rawValues.lemonVariantId),
  });

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const normalized = normalizePlanUpdate(parsed.data);

  return {
    success: true,
    data: normalized.data,
    warnings: normalized.warnings,
  };
}

export function toPlanUpdateData(input: NormalizedPlanUpdate, existingPlan: Plan) {
  return {
    name: input.name,
    price: input.price,
    currency: input.currency,
    billingType: input.billingType,
    isActive: input.isActive,
    allowBasicScan: input.allowBasicScan,
    allowProfessionalScan: input.allowProfessionalScan,
    basicScanLimitPerDay: input.basicScanLimitPerDay,
    professionalScanLimitPerDay: input.professionalScanLimitPerDay,
    allowBasicPdf: input.allowBasicPdf,
    allowProfessionalPdf: input.allowProfessionalPdf,
    basicPdfCredits: input.basicPdfCredits,
    professionalPdfCredits: input.professionalPdfCredits,
    totalReportCredits: input.totalReportCredits,
    allowManualReview: input.allowManualReview,
    lightManualReviewCredits: input.lightManualReviewCredits,
    deepManualReviewCredits: input.deepManualReviewCredits,
    allowPriorityGuidance: input.allowPriorityGuidance,
    allowWhiteLabel: input.allowWhiteLabel,
    allowAgencyBranding: input.allowAgencyBranding,
    allowClientManagement: input.allowClientManagement,
    allowShareLinks: input.allowShareLinks,
    allowHidePoweredBy: input.allowHidePoweredBy,
    allowPrioritySupport: input.allowPrioritySupport,
    preferredPaymentProvider: input.preferredPaymentProvider,
    stripeEnabled: input.stripeEnabled,
    stripeProductId: input.stripeProductId ?? null,
    stripePriceId: input.stripePriceId ?? null,
    lemonEnabled: input.lemonEnabled,
    lemonProductId: input.lemonProductId ?? null,
    lemonVariantId: input.lemonVariantId ?? null,
    reportCredits: input.totalReportCredits,
    whiteLabelEnabled: input.allowWhiteLabel,
    clientManagementEnabled: input.allowClientManagement,
    shareLinkEnabled: input.allowShareLinks,
    manualReviewEnabled: input.allowManualReview,
    isStripeEnabled: input.stripeEnabled,
    stripeMode:
      existingPlan.stripeMode ??
      (input.billingType === "MONTHLY" ? "subscription" : "payment"),
  };
}

type AuditSnapshot = Record<AuditField, string | number | boolean | null>;

function asAuditSnapshot(value: Record<string, unknown>): AuditSnapshot {
  const price = value.price;

  return {
    name: String(value.name ?? ""),
    price:
      typeof price === "number" && Number.isFinite(price)
        ? Number(price.toFixed(2))
        : Number(value.price ?? 0),
    currency: String(value.currency ?? "USD"),
    billingType: String(value.billingType ?? "FREE"),
    isActive: Boolean(value.isActive),
    allowBasicScan: Boolean(value.allowBasicScan),
    allowProfessionalScan: Boolean(value.allowProfessionalScan),
    basicScanLimitPerDay: Number(value.basicScanLimitPerDay ?? 0),
    professionalScanLimitPerDay: Number(value.professionalScanLimitPerDay ?? 0),
    allowBasicPdf: Boolean(value.allowBasicPdf),
    allowProfessionalPdf: Boolean(value.allowProfessionalPdf),
    basicPdfCredits: Number(value.basicPdfCredits ?? 0),
    professionalPdfCredits: Number(value.professionalPdfCredits ?? 0),
    totalReportCredits: Number(value.totalReportCredits ?? 0),
    allowManualReview: Boolean(value.allowManualReview),
    lightManualReviewCredits: Number(value.lightManualReviewCredits ?? 0),
    deepManualReviewCredits: Number(value.deepManualReviewCredits ?? 0),
    allowPriorityGuidance: Boolean(value.allowPriorityGuidance),
    allowWhiteLabel: Boolean(value.allowWhiteLabel),
    allowAgencyBranding: Boolean(value.allowAgencyBranding),
    allowClientManagement: Boolean(value.allowClientManagement),
    allowShareLinks: Boolean(value.allowShareLinks),
    allowHidePoweredBy: Boolean(value.allowHidePoweredBy),
    allowPrioritySupport: Boolean(value.allowPrioritySupport),
    preferredPaymentProvider: value.preferredPaymentProvider
      ? String(value.preferredPaymentProvider)
      : null,
    stripeEnabled: Boolean(value.stripeEnabled),
    stripeProductId: value.stripeProductId ? String(value.stripeProductId) : null,
    stripePriceId: value.stripePriceId ? String(value.stripePriceId) : null,
    lemonEnabled: Boolean(value.lemonEnabled),
    lemonProductId: value.lemonProductId ? String(value.lemonProductId) : null,
    lemonVariantId: value.lemonVariantId ? String(value.lemonVariantId) : null,
    reportCredits: Number(value.reportCredits ?? 0),
    whiteLabelEnabled: Boolean(value.whiteLabelEnabled),
    clientManagementEnabled: Boolean(value.clientManagementEnabled),
    shareLinkEnabled: Boolean(value.shareLinkEnabled),
    manualReviewEnabled: Boolean(value.manualReviewEnabled),
    isStripeEnabled: Boolean(value.isStripeEnabled),
  };
}

export function buildPlanAuditMetadata(input: {
  before: Plan;
  afterData: ReturnType<typeof toPlanUpdateData>;
  planId: string;
  planName: string;
  warnings?: string[];
}) {
  const before = asAuditSnapshot({
    ...buildPlanUpdateInputFromPlan(input.before),
    reportCredits: input.before.reportCredits,
    whiteLabelEnabled: input.before.whiteLabelEnabled,
    clientManagementEnabled: input.before.clientManagementEnabled,
    shareLinkEnabled: input.before.shareLinkEnabled,
    manualReviewEnabled: input.before.manualReviewEnabled,
    isStripeEnabled: input.before.isStripeEnabled,
  });
  const after = asAuditSnapshot(input.afterData);

  const changedFields = AUDIT_FIELDS.filter((field) => before[field] !== after[field]);

  return {
    planId: input.planId,
    planName: input.planName,
    changedFields,
    before,
    after,
    warnings: input.warnings ?? [],
    timestamp: new Date().toISOString(),
  };
}

export function parsePlanUpdateFromFormData(formData: FormData): NormalizedPlanParseResult {
  return parsePlanUpdateInput({
    name: formData.get("name"),
    price: formData.get("price"),
    currency: formData.get("currency"),
    billingType: formData.get("billingType"),
    isActive: formData.has("isActive"),
    allowBasicScan: formData.has("allowBasicScan"),
    allowProfessionalScan: formData.has("allowProfessionalScan"),
    basicScanLimitPerDay: formData.get("basicScanLimitPerDay"),
    professionalScanLimitPerDay: formData.get("professionalScanLimitPerDay"),
    allowBasicPdf: formData.has("allowBasicPdf"),
    allowProfessionalPdf: formData.has("allowProfessionalPdf"),
    basicPdfCredits: formData.get("basicPdfCredits"),
    professionalPdfCredits: formData.get("professionalPdfCredits"),
    totalReportCredits: formData.get("totalReportCredits"),
    allowManualReview: formData.has("allowManualReview"),
    lightManualReviewCredits: formData.get("lightManualReviewCredits"),
    deepManualReviewCredits: formData.get("deepManualReviewCredits"),
    allowPriorityGuidance: formData.has("allowPriorityGuidance"),
    allowWhiteLabel: formData.has("allowWhiteLabel"),
    allowAgencyBranding: formData.has("allowAgencyBranding"),
    allowClientManagement: formData.has("allowClientManagement"),
    allowShareLinks: formData.has("allowShareLinks"),
    allowHidePoweredBy: formData.has("allowHidePoweredBy"),
    allowPrioritySupport: formData.has("allowPrioritySupport"),
    preferredPaymentProvider: formData.get("preferredPaymentProvider"),
    stripeEnabled: formData.has("stripeEnabled"),
    stripeProductId: formData.get("stripeProductId"),
    stripePriceId: formData.get("stripePriceId"),
    lemonEnabled: formData.has("lemonEnabled"),
    lemonProductId: formData.get("lemonProductId"),
    lemonVariantId: formData.get("lemonVariantId"),
  });
}

export const billingTypeOptions = billingTypeSchema.options;
export const paymentProviderOptions = paymentProviderSchema.options;
