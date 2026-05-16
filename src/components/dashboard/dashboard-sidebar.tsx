"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CreditCard,
  ContactRound,
  FileText,
  LayoutDashboard,
  Radar,
  Settings,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";

import { adminNavItems, dashboardNavItems, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

const navIcons = {
  Dashboard: LayoutDashboard,
  "New Scan": Radar,
  Scans: BarChart3,
  Reports: FileText,
  Clients: ContactRound,
  Agency: Building2,
  Billing: CreditCard,
  Profile: User,
  Settings,
  Admin: Shield,
};

type DashboardSidebarProps = {
  userRole?: string;
  onNavigate?: () => void;
  className?: string;
};

function isActiveDashboardNavItem(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  if (href === "/dashboard/scans/new") {
    return pathname === href;
  }

  if (href === "/dashboard/scans") {
    return (
      pathname === href ||
      (pathname.startsWith("/dashboard/scans/") &&
        !pathname.startsWith("/dashboard/scans/new"))
    );
  }

  return pathname === href;
}

function DashboardSidebar({ userRole, onNavigate, className }: DashboardSidebarProps) {
  const pathname = usePathname();
  const navItems =
    userRole === "ADMIN" ? [...dashboardNavItems, ...adminNavItems.slice(0, 1)] : dashboardNavItems;

  return (
    <aside
      className={cn(
        "flex h-full w-72 max-w-full flex-col border-r border-border bg-card",
        className,
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold tracking-normal">
          {siteConfig.name}
        </span>
      </div>
      <nav className="min-w-0 flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = navIcons[item.label as keyof typeof navIcons] ?? BarChart3;
          const active = isActiveDashboardNavItem(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Safe scan boundary</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The product is scoped to website posture checks, report generation,
            and client-friendly remediation guidance.
          </p>
        </div>
      </div>
    </aside>
  );
}

export { DashboardSidebar };
