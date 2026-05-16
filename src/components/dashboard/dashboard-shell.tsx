"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import type { CurrentUser } from "@/lib/auth";

type DashboardShellProps = {
  children: ReactNode;
  user: CurrentUser;
};

function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <div className="sticky top-0 z-40 hidden h-screen w-72 shrink-0 lg:flex">
        <DashboardSidebar userRole={user.role} />
      </div>

      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent
          className="!left-0 !top-0 h-screen w-[86vw] max-w-xs !translate-x-0 !translate-y-0 rounded-none border-y-0 border-l-0 p-0"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Dashboard navigation</DialogTitle>
            <DialogDescription>Open dashboard navigation links.</DialogDescription>
          </DialogHeader>
          <DashboardSidebar userRole={user.role} onNavigate={() => setSidebarOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar user={user} onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export { DashboardShell };
