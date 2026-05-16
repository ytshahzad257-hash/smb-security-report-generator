"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

import { Button } from "@/components/ui/button";

type ScanAutoRefreshProps = {
  enabled: boolean;
  intervalMs?: number;
};

function ScanAutoRefresh({ enabled, intervalMs = 4_000 }: ScanAutoRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const refreshScan = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshInterval = window.setInterval(refreshScan, intervalMs);

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, [enabled, intervalMs, refreshScan]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={refreshScan}
      disabled={isPending}
    >
      <RefreshCw
        className={isPending ? "animate-spin" : undefined}
        aria-hidden="true"
      />
      Refresh
    </Button>
  );
}

export { ScanAutoRefresh };
