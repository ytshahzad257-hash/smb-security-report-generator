import { getPrisma } from "@/lib/prisma";
import { getWhiteLabelAccess } from "./agencyAccess";
import {
  getAgencyDefaults,
  validateAgencyProfileInput,
  type AgencyProfileInput,
} from "./agencyValidation";

const AGENCY_BRANDING_BLOCKED_MESSAGE =
  "Agency branding is not included in your current plan.";
const POWERED_BY_HIDE_BLOCKED_MESSAGE =
  "Removing powered-by branding is not included in your current plan.";

export type AgencyBranding = {
  agencyName: string;
  agencyLogoDataUri: string | null;
  logoUrl: string | null;
  logoPath: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  address: string | null;
  footerText: string;
  showPoweredBy: boolean;
};

export async function getAgencyProfileForUser(userId: string) {
  const prisma = getPrisma();

  return prisma.agencyProfile.findUnique({
    where: { userId },
  });
}

export async function getAgencyProfileResponse(user: {
  id: string;
  name: string | null;
}) {
  const [profile, access] = await Promise.all([
    getAgencyProfileForUser(user.id),
    getWhiteLabelAccess(user.id),
  ]);
  const defaults = {
    ...getAgencyDefaults(user),
    logoUrl: null as string | null,
  };

  return {
    access,
    defaults,
    profile: profile
      ? {
          address: profile.address,
          agencyName: profile.agencyName,
          contactEmail: profile.contactEmail,
          footerText: profile.footerText ?? defaults.footerText,
          logoUrl: profile.logoUrl,
          primaryColor: profile.primaryColor ?? profile.brandColor ?? defaults.primaryColor,
          secondaryColor: profile.secondaryColor,
          showPoweredBy: access.canRemovePoweredBy ? profile.showPoweredBy : true,
          websiteUrl: profile.websiteUrl ?? profile.website,
        }
      : defaults,
  };
}

export async function upsertAgencyProfile(
  user: { id: string; name: string | null },
  input: AgencyProfileInput,
) {
  const prisma = getPrisma();
  const access = await getWhiteLabelAccess(user.id);
  const requestedHidePoweredBy = input.showPoweredBy === false;
  const showPoweredBy = access.canRemovePoweredBy ? input.showPoweredBy : true;

  if (!access.canUseWhiteLabel) {
    const { logAbuseEvent } = await import("../security/abuseLog.ts");
    await logAbuseEvent({
      eventType: "PLAN_WHITE_LABEL_ACCESS_BLOCKED",
      metadata: {
        feature: "agency_branding",
        planId: access.entitlements.planId,
        planName: access.entitlements.planName,
        planSlug: access.entitlements.planSlug ?? null,
        reason: AGENCY_BRANDING_BLOCKED_MESSAGE,
      },
      reason: AGENCY_BRANDING_BLOCKED_MESSAGE,
      severity: "INFO",
      target: "agency-profile",
      userId: user.id,
    });

    return {
      error: AGENCY_BRANDING_BLOCKED_MESSAGE,
      status: 403,
      success: false as const,
    };
  }

  if (requestedHidePoweredBy && !access.canRemovePoweredBy) {
    const { logAbuseEvent } = await import("../security/abuseLog.ts");
    await logAbuseEvent({
      eventType: "PLAN_POWERED_BY_HIDE_BLOCKED",
      metadata: {
        feature: "hide_powered_by",
        planId: access.entitlements.planId,
        planName: access.entitlements.planName,
        planSlug: access.entitlements.planSlug ?? null,
        reason: POWERED_BY_HIDE_BLOCKED_MESSAGE,
      },
      reason: POWERED_BY_HIDE_BLOCKED_MESSAGE,
      severity: "INFO",
      target: "agency-profile",
      userId: user.id,
    });
  }

  const profile = await prisma.agencyProfile.upsert({
    create: {
      address: input.address,
      agencyName: input.agencyName,
      contactEmail: input.contactEmail,
      footerText: input.footerText,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      showPoweredBy,
      userId: user.id,
      websiteUrl: input.websiteUrl,
    },
    update: {
      address: input.address,
      agencyName: input.agencyName,
      brandColor: input.primaryColor,
      contactEmail: input.contactEmail,
      footerText: input.footerText,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      showPoweredBy,
      website: input.websiteUrl,
      websiteUrl: input.websiteUrl,
    },
    where: { userId: user.id },
  });

  return {
    profile,
    success: true as const,
    warning:
      requestedHidePoweredBy && !access.canRemovePoweredBy
        ? POWERED_BY_HIDE_BLOCKED_MESSAGE
        : undefined,
  };
}

export async function resetAgencyProfile(user: { id: string; name: string | null }) {
  const defaults = getAgencyDefaults(user);
  const validated = validateAgencyProfileInput(defaults);

  if (!validated.success) {
    throw new Error("Default agency profile values are invalid.");
  }

  return upsertAgencyProfile(user, validated.data);
}

export async function getPdfBrandingForUser(userId: string): Promise<{
  branding: AgencyBranding | null;
  canUseWhiteLabel: boolean;
  reportType: "PROFESSIONAL" | "WHITE_LABEL";
}> {
  const [profile, access] = await Promise.all([
    getAgencyProfileForUser(userId),
    getWhiteLabelAccess(userId),
  ]);

  if (!access.canUseWhiteLabel || !profile) {
    return {
      branding: null,
      canUseWhiteLabel: false,
      reportType: "PROFESSIONAL",
    };
  }

  const { getAgencyLogoDataUri } = await import("./logoUpload.ts");
  const agencyLogoDataUri = await getAgencyLogoDataUri(profile.logoPath);

  return {
    branding: {
      address: profile.address,
      agencyLogoDataUri,
      agencyName: profile.agencyName,
      contactEmail: profile.contactEmail,
      footerText: profile.footerText,
      logoPath: profile.logoPath,
      logoUrl: profile.logoUrl,
      primaryColor: profile.primaryColor ?? profile.brandColor ?? "#0f172a",
      secondaryColor: profile.secondaryColor,
      showPoweredBy: access.canRemovePoweredBy ? profile.showPoweredBy : true,
      websiteUrl: profile.websiteUrl ?? profile.website,
    },
    canUseWhiteLabel: true,
    reportType: "WHITE_LABEL",
  };
}
