type PlanLike = {
  allowHidePoweredBy?: boolean;
  manualReviewEnabled?: boolean;
  name?: string;
  slug?: string;
  whiteLabelEnabled: boolean;
};

export function canRemovePoweredByForPlan(plan: PlanLike) {
  if (typeof plan.allowHidePoweredBy === "boolean") {
    return plan.allowHidePoweredBy;
  }

  return Boolean(
    plan.whiteLabelEnabled &&
      (plan.slug === "agency-pro" ||
        plan.name?.toLowerCase() === "agency pro" ||
        plan.manualReviewEnabled),
  );
}

export async function getWhiteLabelAccess(userId: string) {
  const {
    canHidePoweredByForEntitlements,
    canUseAgencyBrandingForEntitlements,
    canUseWhiteLabelForEntitlements,
    getPlanEntitlementsForUser,
  } = await import("../billing/planEntitlements.ts");
  const entitlements = await getPlanEntitlementsForUser(userId);
  const canUseWhiteLabel = canUseWhiteLabelForEntitlements(entitlements);
  const canUseAgencyBranding = canUseAgencyBrandingForEntitlements(entitlements);
  const canRemovePoweredBy = canHidePoweredByForEntitlements(entitlements);

  return {
    canRemovePoweredBy,
    canUseAgencyBranding,
    canUseWhiteLabel,
    entitlements,
    plan: {
      name: entitlements.planName,
      slug: entitlements.planSlug ?? "free-demo",
      whiteLabelEnabled: entitlements.allowWhiteLabel,
    },
  };
}
