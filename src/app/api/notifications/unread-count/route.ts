import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/notifications/notifications";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  const unreadCount = await getUnreadNotificationCount(user.id);

  return NextResponse.json({ success: true, unreadCount });
}
