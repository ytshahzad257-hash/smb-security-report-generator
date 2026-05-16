import type { ReactNode } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { adminNavItems } from "@/lib/site";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminUser("/dashboard/admin");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
        <Badge variant="destructive">Admin</Badge>
        {adminNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
