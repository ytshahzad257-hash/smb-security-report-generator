import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type DataTableColumn = {
  key: string;
  label: string;
  className?: string;
};

type DataTableShellProps = {
  columns: DataTableColumn[];
  rows?: Array<Record<string, ReactNode>>;
  caption?: string;
  emptyState?: ReactNode;
  className?: string;
};

function DataTableShell({
  columns,
  rows = [],
  caption,
  emptyState,
  className,
}: DataTableShellProps) {
  return (
    <Card className={cn("min-w-0 max-w-full overflow-hidden", className)}>
      {caption ? (
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">{caption}</h3>
        </div>
      ) : null}
      <div className="w-full max-w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-normal text-muted-foreground",
                    column.className,
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          {rows.length > 0 ? (
            <tbody className="divide-y divide-border bg-card">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-muted/50">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "max-w-sm whitespace-normal break-words px-5 py-4 text-foreground",
                        column.className,
                      )}
                    >
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      </div>
      {rows.length === 0 && emptyState ? (
        <div className="border-t border-border bg-card p-5">{emptyState}</div>
      ) : null}
    </Card>
  );
}

export { DataTableShell, type DataTableColumn };
