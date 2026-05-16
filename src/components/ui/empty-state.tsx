import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-60 min-w-0 max-w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold tracking-normal text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mt-2 max-w-md break-words text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
