import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
} from "../notifications/notifications.ts";

export type NotificationPreferenceInput = {
  paymentEmails: boolean;
  scanEmails: boolean;
  reportEmails: boolean;
  shareEmails: boolean;
  inAppNotifications?: boolean;
  marketingEmails: boolean;
};

export { getOrCreateNotificationPreferences, updateNotificationPreferences };
