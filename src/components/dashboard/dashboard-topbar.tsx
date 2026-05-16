"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Loader2, LogOut, Menu, Search, Settings, User, WalletCards } from "lucide-react";
import { useState, useTransition } from "react";

import { NotificationBell } from "@/components/dashboard/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CurrentUser } from "@/lib/auth";

type DashboardTopbarProps = {
  onMenuClick: () => void;
  user: CurrentUser;
};

function getCrumb(pathname: string) {
  if (pathname === "/dashboard") {
    return "Overview";
  }

  return pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "Dashboard";
}

function getInitials(user: CurrentUser) {
  const source = user.name || user.email;
  const parts = source.split(/[ @._-]+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function DashboardTopbar({ onMenuClick, user }: DashboardTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, startLogoutTransition] = useTransition();
  const crumb = getCrumb(pathname);
  const displayName = user.name || user.email;

  function handleLogout() {
    startLogoutTransition(async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      setOpen(false);
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 w-full max-w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-16 w-full min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open sidebar"
        >
          <Menu aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Dashboard</p>
          <p className="truncate text-sm font-semibold text-foreground">{crumb}</p>
        </div>

        <div className="relative hidden min-w-0 max-w-xs flex-[1_1_12rem] md:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input className="min-w-0 pl-9" placeholder="Search reports" />
        </div>

        <ThemeToggle />
        <NotificationBell />

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 max-w-[8.5rem] min-w-0 gap-2 px-2 sm:max-w-[12rem] sm:px-3"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
                {getInitials(user)}
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-sm font-medium sm:block">
                {displayName}
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate text-sm">{displayName}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" onClick={() => setOpen(false)}>
                <User aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" onClick={() => setOpen(false)}>
                <Settings aria-hidden="true" />
                Workspace settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/billing" onClick={() => setOpen(false)}>
                <WalletCards aria-hidden="true" />
                Billing
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
              variant="destructive"
              disabled={isLoggingOut}
              className="cursor-pointer"
            >
              {isLoggingOut ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {isLoggingOut ? "Logging out..." : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export { DashboardTopbar };
