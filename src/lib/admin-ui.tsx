import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function formatAdminDate(date: Date | null | undefined) {
  if (!date) {
    return "None";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMoney(value: unknown, currency = "USD") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function statusBadge(status: string | null | undefined): ReactNode {
  const normalized = status ?? "UNKNOWN";
  const variant =
    ["COMPLETED", "ACTIVE", "APPROVED", "GENERATED"].includes(normalized)
      ? "success"
      : ["FAILED", "REJECTED", "SUSPENDED", "CRITICAL", "HIGH"].includes(normalized)
        ? "destructive"
        : ["PENDING", "RUNNING", "WARNING"].includes(normalized)
          ? "warning"
          : "outline";

  return <Badge variant={variant}>{normalized}</Badge>;
}

export function EmptyAdminState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
