"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { updateNotificationPreferences } from "@/lib/notifications/notifications";

export type NotificationPreferencesActionState = {
  status?: "success" | "error";
  message?: string;
};

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export async function updateNotificationPreferencesAction(
  _previousState: NotificationPreferencesActionState,
  formData: FormData,
): Promise<NotificationPreferencesActionState> {
  const user = await requireUser();

  try {
    await updateNotificationPreferences(user.id, {
      inAppNotifications: checked(formData, "inAppNotifications"),
      marketingEmails: checked(formData, "marketingEmails"),
      paymentEmails: checked(formData, "paymentEmails"),
      reportEmails: checked(formData, "reportEmails"),
      scanEmails: checked(formData, "scanEmails"),
      shareEmails: checked(formData, "shareEmails"),
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/notifications");

    return {
      message: "Notification preferences saved.",
      status: "success",
    };
  } catch {
    return {
      message: "Could not save notification preferences. Try again.",
      status: "error",
    };
  }
}
