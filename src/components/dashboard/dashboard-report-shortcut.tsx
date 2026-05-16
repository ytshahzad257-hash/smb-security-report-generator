"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function DashboardReportShortcut() {
  const router = useRouter();
  const [targetUrl, setTargetUrl] = useState("");
  const [scanType, setScanType] = useState("");
  const [pending, setPending] = useState(false);
  const canQueue = targetUrl.trim().length > 0 && scanType.length > 0;
  const destination = useMemo(() => {
    const params = new URLSearchParams();

    if (targetUrl.trim()) {
      params.set("targetUrl", targetUrl.trim());
    }

    if (scanType) {
      params.set("scanType", scanType);
    }

    const query = params.toString();

    return query ? `/dashboard/scans/new?${query}` : "/dashboard/scans/new";
  }, [scanType, targetUrl]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canQueue) {
      return;
    }

    setPending(true);
    router.push(destination);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label htmlFor="dashboard-website" className="text-sm font-medium">
          Website URL
        </label>
        <Input
          id="dashboard-website"
          name="targetUrl"
          placeholder="https://example.com"
          value={targetUrl}
          onChange={(event) => setTargetUrl(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="dashboard-report-type" className="text-sm font-medium">
          Scan type
        </label>
        <Select value={scanType} onValueChange={setScanType}>
          <SelectTrigger id="dashboard-report-type">
            <SelectValue placeholder="Select scan type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BASIC">Basic scan</SelectItem>
            <SelectItem value="PROFESSIONAL">Professional scan</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canQueue || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Opening..." : "Continue"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setPending(true);
            router.push("/dashboard/scans/new");
          }}
        >
          Go to New Scan
        </Button>
      </div>
    </form>
  );
}

export { DashboardReportShortcut };
