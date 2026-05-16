import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "SMB Security Report Generator dashboard foundation.",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
