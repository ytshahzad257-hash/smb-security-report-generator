import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getWhiteLabelAccess } from "@/lib/agency/agencyAccess";
import { getAgencyDefaults } from "@/lib/agency/agencyValidation";
import { getAgencyProfileForUser, upsertAgencyProfile } from "@/lib/agency/agencyProfile";
import { deleteAgencyLogo, saveAgencyLogo } from "@/lib/agency/logoUpload";
import { logAbuseEvent } from "@/lib/security/abuseLog";

const AGENCY_BRANDING_BLOCKED_MESSAGE =
  "Agency branding is not included in your current plan.";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const access = await getWhiteLabelAccess(user.id);

  if (!access.canUseWhiteLabel) {
    await logAbuseEvent({
      eventType: "PLAN_WHITE_LABEL_ACCESS_BLOCKED",
      metadata: {
        feature: "agency_logo_upload",
        planId: access.entitlements.planId,
        planName: access.entitlements.planName,
        planSlug: access.entitlements.planSlug ?? null,
        reason: AGENCY_BRANDING_BLOCKED_MESSAGE,
      },
      reason: AGENCY_BRANDING_BLOCKED_MESSAGE,
      severity: "INFO",
      target: "agency-logo",
      userId: user.id,
    });

    return NextResponse.json(
      {
        error: AGENCY_BRANDING_BLOCKED_MESSAGE,
        success: false,
      },
      { status: 403 },
    );
  }

  const existingProfile = await getAgencyProfileForUser(user.id);

  if (!existingProfile) {
    const ensured = await upsertAgencyProfile(user, getAgencyDefaults(user));

    if (!ensured.success) {
      return NextResponse.json(ensured, { status: ensured.status });
    }
  }

  const formData = await request.formData();
  const logo = formData.get("logo");
  const result = await saveAgencyLogo(user.id, logo instanceof File ? logo : null);

  if (!result.success) {
    return NextResponse.json(result, { status: result.status });
  }

  return NextResponse.json(result);
}

export async function DELETE() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const access = await getWhiteLabelAccess(user.id);

  if (!access.canUseWhiteLabel) {
    await logAbuseEvent({
      eventType: "PLAN_WHITE_LABEL_ACCESS_BLOCKED",
      metadata: {
        feature: "agency_logo_delete",
        planId: access.entitlements.planId,
        planName: access.entitlements.planName,
        planSlug: access.entitlements.planSlug ?? null,
        reason: AGENCY_BRANDING_BLOCKED_MESSAGE,
      },
      reason: AGENCY_BRANDING_BLOCKED_MESSAGE,
      severity: "INFO",
      target: "agency-logo",
      userId: user.id,
    });

    return NextResponse.json(
      {
        error: AGENCY_BRANDING_BLOCKED_MESSAGE,
        success: false,
      },
      { status: 403 },
    );
  }

  const profile = await getAgencyProfileForUser(user.id);

  if (!profile) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(await deleteAgencyLogo(user.id));
}
