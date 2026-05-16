import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { markAllNotificationsRead } from "@/lib/notifications/notifications";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  const result = await markAllNotificationsRead(user.id);

  return NextResponse.json({ success: true, updatedCount: result.updatedCount });
}
