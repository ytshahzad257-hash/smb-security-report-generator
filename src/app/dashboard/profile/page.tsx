import type { Metadata } from "next";
import { CalendarDays, Mail, ShieldCheck, User } from "lucide-react";

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
  title: "Profile",
  description: "Authenticated user profile details.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

export default async function ProfilePage() {
  const user = await requireUser();

  const rows = [
    {
      label: "Name",
      value: user.name ?? "Not set",
      icon: <User className="size-4" aria-hidden="true" />,
    },
    {
      label: "Email",
      value: user.email,
      icon: <Mail className="size-4" aria-hidden="true" />,
    },
    {
      label: "Role",
      value: user.role,
      icon: <ShieldCheck className="size-4" aria-hidden="true" />,
    },
    {
      label: "Created",
      value: formatDate(user.createdAt),
      icon: <CalendarDays className="size-4" aria-hidden="true" />,
    },
  ];

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Review the authenticated account details stored for your workspace."
      />

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            These details come from the current authenticated session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start gap-3 rounded-md border border-border bg-background p-4"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {row.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{row.label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-foreground">
                  {row.value}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
