import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { markNotificationRead } from "@/lib/notifications/notifications";

export async function POST(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  const { id } = await segmentData.params;
  const result = await markNotificationRead(user.id, id);

  if (!result.updated) {
    return NextResponse.json(
      { error: "Notification not found.", success: false },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
