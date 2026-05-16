import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  ReportShareError,
  revokeShareForUser,
} from "@/lib/reports/reportSharing";

export async function PATCH(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  try {
    const { id } = await segmentData.params;

    await revokeShareForUser(user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof ReportShareError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Share link could not be revoked.";

    return NextResponse.json({ error: message, success: false }, { status });
  }
}
