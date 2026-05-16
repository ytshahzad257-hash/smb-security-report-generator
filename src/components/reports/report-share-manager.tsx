"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Loader2, Share2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ShareRecord = {
  createdAt: Date | string;
  expiresAt: Date | string | null;
  id: string;
  isActive: boolean;
  lastViewedAt: Date | string | null;
  title: string | null;
  token: string;
  viewCount: number;
};

type ReportShareManagerProps = {
  clients: Array<{
    companyName: string | null;
    id: string;
    name: string;
  }>;
  initialShares: ShareRecord[];
  reportId: string;
  shareEnabled: boolean;
};

function formatDate(value: Date | string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shareStatus(share: ShareRecord) {
  if (!share.isActive) {
    return { label: "Revoked", variant: "destructive" as const };
  }

  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", variant: "warning" as const };
  }

  return { label: "Active", variant: "success" as const };
}

export function ReportShareManager({
  clients,
  initialShares,
  reportId,
  shareEnabled,
}: ReportShareManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState(initialShares);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("__none");
  const [expiresIn, setExpiresIn] = useState("never");
  const [customExpiresAt, setCustomExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const origin = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.location.origin;
  }, []);

  function toUrl(token: string) {
    return `${origin}/share/report/${token}`;
  }

  async function refreshShares() {
    const response = await fetch(`/api/reports/${reportId}/shares`);
    const payload = (await response.json()) as {
      error?: string;
      shares?: ShareRecord[];
      success: boolean;
    };

    if (response.ok && payload.success && payload.shares) {
      setShares(payload.shares);
    }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
  }

  function createShare() {
    setError(null);
    setCreatedUrl(null);
    startTransition(async () => {
      const response = await fetch(`/api/reports/${reportId}/share`, {
        body: JSON.stringify({
          clientId: clientId === "__none" ? null : clientId,
          customExpiresAt,
          expiresIn,
          password,
          title,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        share?: ShareRecord;
        success: boolean;
      };

      if (!response.ok || !payload.success || !payload.share) {
        setError(payload.error ?? "Share link could not be created.");
        return;
      }

      setCreatedUrl(toUrl(payload.share.token));
      setShares((current) => [payload.share!, ...current]);
      setTitle("");
      setPassword("");
      router.refresh();
    });
  }

  function revokeShare(share: ShareRecord) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/report-shares/${share.id}/revoke`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string; success: boolean };

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Share link could not be revoked.");
        return;
      }

      await refreshShares();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Share2 className="size-4" aria-hidden="true" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share report</DialogTitle>
          <DialogDescription>
            Create read-only client-facing links for the generated PDF report.
          </DialogDescription>
        </DialogHeader>

        {!shareEnabled ? (
          <Alert>
            <AlertDescription>
              Secure report sharing is available on paid and agency plans.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor={`title-${reportId}`}>
                Report title
              </label>
              <Input
                id={`title-${reportId}`}
                placeholder="Quarterly security posture report"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Client</label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No client selected" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No client selected</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.companyName
                          ? `${client.name} - ${client.companyName}`
                          : client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Expiration</label>
                <Select value={expiresIn} onValueChange={setExpiresIn}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never expires</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="custom">Custom date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {expiresIn === "custom" ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={`expires-${reportId}`}>
                  Custom expiration
                </label>
                <Input
                  id={`expires-${reportId}`}
                  type="datetime-local"
                  value={customExpiresAt}
                  onChange={(event) => setCustomExpiresAt(event.target.value)}
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor={`password-${reportId}`}>
                Password protection
              </label>
              <Input
                id={`password-${reportId}`}
                placeholder="Optional password, minimum 8 characters"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {createdUrl ? (
              <div className="grid min-w-0 gap-2 rounded-md border border-border bg-background p-3">
                <p className="text-sm font-medium text-foreground">Share link created</p>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Input readOnly value={createdUrl} />
                  <Button type="button" variant="outline" onClick={() => copyLink(createdUrl)}>
                    <Copy className="size-4" aria-hidden="true" />
                    Copy
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3">
          <h3 className="text-sm font-semibold text-foreground">Share links</h3>
          {shares.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
              No share links yet.
            </p>
          ) : (
            shares.map((share) => {
              const status = shareStatus(share);
              const url = toUrl(share.token);

              return (
                <article
                  key={share.id}
                  className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-foreground">
                        {share.title ?? "Shared report"}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {url}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <p>Expires {formatDate(share.expiresAt)}</p>
                    <p>Views {share.viewCount}</p>
                    <p>Last viewed {formatDate(share.lastViewedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => copyLink(url)}>
                      <Copy className="size-4" aria-hidden="true" />
                      Copy link
                    </Button>
                    {share.isActive ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => revokeShare(share)}
                      >
                        <XCircle className="size-4" aria-hidden="true" />
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          {shareEnabled ? (
            <Button type="button" onClick={createShare} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Create share link
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
