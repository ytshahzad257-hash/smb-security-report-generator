import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full min-w-0 max-w-full rounded-lg border p-4 text-sm leading-6 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:min-w-0 [&>svg+div]:pl-7",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        info: "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300",
        warning: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        destructive: "border-destructive/35 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5 className={cn("mb-1 font-semibold leading-none", className)} {...props} />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("break-words text-sm leading-6 opacity-90", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
