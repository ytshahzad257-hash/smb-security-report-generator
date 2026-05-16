"use client";

import { useState, useTransition } from "react";
import { Loader2, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ScanClientAssignmentProps = {
  clients: Array<{
    companyName: string | null;
    id: string;
    name: string;
  }>;
  currentClientId: string | null;
  scanId: string;
};

export function ScanClientAssignment({
  clients,
  currentClientId,
  scanId,
}: ScanClientAssignmentProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState(currentClientId ?? "__none");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function assignClient() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/scans/${scanId}/assign-client`, {
        body: JSON.stringify({
          clientId: clientId === "__none" ? null : clientId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string; success: boolean };

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Client assignment could not be saved.");
        return;
      }

      router.refresh();
    });
  }

  if (clients.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger aria-label="Assign client">
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No client assigned</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.companyName
                  ? `${client.name} - ${client.companyName}`
                  : client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={assignClient} disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <UserRoundPlus className="size-4" aria-hidden="true" />
          )}
          {currentClientId ? "Change client" : "Assign client"}
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
