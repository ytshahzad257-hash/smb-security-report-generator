"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";

import { marketingNavItems, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function PublicNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 max-w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-semibold tracking-normal sm:text-base">
            {siteConfig.name}
          </span>
        </Link>

        <nav className="hidden min-w-0 items-center gap-1 md:flex">
          {marketingNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname === item.href && "bg-muted text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Start free</Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open navigation"
            >
              <Menu aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent className="top-4 translate-y-0 sm:max-w-sm" showCloseButton>
            <DialogHeader>
              <DialogTitle>{siteConfig.name}</DialogTitle>
              <DialogDescription>
                Navigate the public pages and dashboard preview.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {marketingNavItems.map((item) => (
                <DialogClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      pathname === item.href && "bg-muted text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </DialogClose>
              ))}
            </div>
            <div className="grid gap-2 border-t border-border pt-4">
              <DialogClose asChild>
                <Button asChild variant="outline">
                  <Link href="/login">Log in</Link>
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button asChild>
                  <Link href="/signup">Start free</Link>
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}

export { PublicNavbar };
