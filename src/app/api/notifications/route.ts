import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { getUserNotifications } from "@/lib/notifications/notifications";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  const url = new URL(request.url);
  const limitValue = Number(url.searchParams.get("limit") ?? "20");
  const notifications = await getUserNotifications(user.id, limitValue);

  return NextResponse.json({ notifications, success: true });
}
