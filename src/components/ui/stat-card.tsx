import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
  trend?: ReactNode;
  className?: string;
};

function StatCard({
  label,
  value,
  helper,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 break-words text-2xl font-semibold tracking-normal text-foreground">
              {value}
            </p>
          </div>
          {icon ? (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              {icon}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex min-h-5 items-center justify-between gap-3 text-sm">
          {helper ? (
            <p className="min-w-0 break-words text-muted-foreground">{helper}</p>
          ) : (
            <span />
          )}
          {trend}
        </div>
      </CardContent>
    </Card>
  );
}

export { StatCard };
