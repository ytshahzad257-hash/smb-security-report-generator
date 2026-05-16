import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
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

export const metadata: Metadata = {
  title: "Settings",
  description: "Settings placeholder.",
};

export default async function SettingsPage() {
  await requireUser();

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Manage workspace preferences and notification controls."
      />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose Light, Dark, or System theme mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle mode="full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification settings</CardTitle>
          <CardDescription>
            Manage email and in-app notification preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/settings/notifications">
              <Bell aria-hidden="true" />
              Notification settings
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
