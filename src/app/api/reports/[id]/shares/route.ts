import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  listSharesForReport,
  ReportShareError,
} from "@/lib/reports/reportSharing";

export async function GET(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  try {
    const { id } = await segmentData.params;
    const shares = await listSharesForReport(user.id, id);

    return NextResponse.json({ shares, success: true });
  } catch (error) {
    const status = error instanceof ReportShareError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Share links could not be loaded.";

    return NextResponse.json({ error: message, success: false }, { status });
  }
}
