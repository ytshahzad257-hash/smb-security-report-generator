import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/notifications";

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  const preferences = await getOrCreateNotificationPreferences(user.id);

  return NextResponse.json({ preferences, success: true });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload.", success: false },
      { status: 400 },
    );
  }

  const input = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const existing = await getOrCreateNotificationPreferences(user.id);

  const preferences = await updateNotificationPreferences(user.id, {
    inAppNotifications: normalizeBoolean(input.inAppNotifications, existing.inAppNotifications),
    marketingEmails: normalizeBoolean(input.marketingEmails, existing.marketingEmails),
    paymentEmails: normalizeBoolean(input.paymentEmails, existing.paymentEmails),
    reportEmails: normalizeBoolean(input.reportEmails, existing.reportEmails),
    scanEmails: normalizeBoolean(input.scanEmails, existing.scanEmails),
    shareEmails: normalizeBoolean(input.shareEmails, existing.shareEmails),
  });

  return NextResponse.json({ preferences, success: true });
}
