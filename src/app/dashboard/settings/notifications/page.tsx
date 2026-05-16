import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { NotificationPreferencesForm } from "@/components/dashboard/notification-preferences-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getOrCreateNotificationPreferences } from "@/lib/notifications/notifications";

export const metadata: Metadata = {
  title: "Notification Settings",
};

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const preferences = await getOrCreateNotificationPreferences(user.id);

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Notification settings"
        description="Choose which account, payment, scan, report, and share notifications should arrive by email or in-app alerts."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/settings">Back to settings</Link>
          </Button>
        }
      />

      <Alert variant="info">
        <Bell className="size-4" aria-hidden="true" />
        <div>
          <AlertTitle>Transactional only</AlertTitle>
          <AlertDescription>
            Marketing email is off by default. Critical account and payment records still live in your dashboard.
          </AlertDescription>
        </div>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>
            These settings control app notifications. They do not activate plans, credits, or report links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm preferences={preferences} />
        </CardContent>
      </Card>
    </div>
  );
}
