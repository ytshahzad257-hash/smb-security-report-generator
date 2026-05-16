import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getAgencyProfileResponse, resetAgencyProfile, upsertAgencyProfile } from "@/lib/agency/agencyProfile";
import { validateAgencyProfileInput } from "@/lib/agency/agencyValidation";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const data = await getAgencyProfileResponse(user);

  return NextResponse.json({ ...data, success: true });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!payload) {
    return NextResponse.json(
      { error: "Invalid JSON payload.", success: false },
      { status: 400 },
    );
  }

  if (payload.reset === true) {
    const result = await resetAgencyProfile(user);

    if (!result.success) {
      return NextResponse.json(result, { status: result.status });
    }

    const data = await getAgencyProfileResponse(user);

    return NextResponse.json({ ...data, success: true });
  }

  const validated = validateAgencyProfileInput(payload);

  if (!validated.success) {
    return NextResponse.json(
      { errors: validated.errors, success: false },
      { status: 400 },
    );
  }

  const result = await upsertAgencyProfile(user, validated.data);

  if (!result.success) {
    return NextResponse.json(result, { status: result.status });
  }

  const data = await getAgencyProfileResponse(user);

  return NextResponse.json({ ...data, success: true, warning: result.warning });
}
