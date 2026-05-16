import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import {
  createReportShareForUser,
  parseReportShareInput,
  ReportShareError,
} from "@/lib/reports/reportSharing";
import { notifyReportShareCreated } from "@/lib/email/notifications";

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }
  await assertActiveUser(user.id);

  try {
    const { id } = await segmentData.params;
    const share = await createReportShareForUser(
      user.id,
      id,
      parseReportShareInput(await request.json()),
    );
    await notifyReportShareCreated(share.id);

    return NextResponse.json({ share, success: true }, { status: 201 });
  } catch (error) {
    const status = error instanceof ReportShareError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Share link could not be created.";

    return NextResponse.json({ error: message, success: false }, { status });
  }
}
