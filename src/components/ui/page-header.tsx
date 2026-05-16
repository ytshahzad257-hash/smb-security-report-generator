import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-full">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-accent-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-3xl break-words text-base leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 shrink-0 flex-wrap gap-3">{actions}</div>
      ) : null}
    </div>
  );
}

export { PageHeader };
