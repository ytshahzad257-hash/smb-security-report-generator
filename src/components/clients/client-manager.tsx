"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit3, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Textarea } from "@/components/ui/textarea";

type ClientRecord = {
  _count?: {
    reports: number;
    scans: number;
  };
  companyName: string | null;
  contactEmail: string | null;
  createdAt: Date | string;
  id: string;
  name: string;
  notes: string | null;
  phone: string | null;
  updatedAt: Date | string;
  website: string | null;
};

type ClientManagerProps = {
  clients: ClientRecord[];
  locked: boolean;
};

type FormState = {
  companyName: string;
  contactEmail: string;
  name: string;
  notes: string;
  phone: string;
  website: string;
};

const emptyForm: FormState = {
  companyName: "",
  contactEmail: "",
  name: "",
  notes: "",
  phone: "",
  website: "",
};

function toForm(client?: ClientRecord): FormState {
  if (!client) {
    return emptyForm;
  }

  return {
    companyName: client.companyName ?? "",
    contactEmail: client.contactEmail ?? "",
    name: client.name,
    notes: client.notes ?? "",
    phone: client.phone ?? "",
    website: client.website ?? "",
  };
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function ClientManager({ clients, locked }: ClientManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return clients;
    }

    return clients.filter((client) =>
      [
        client.name,
        client.companyName,
        client.contactEmail,
        client.website,
      ].some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [clients, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(client: ClientRecord) {
    setEditing(client);
    setForm(toForm(client));
    setError(null);
    setOpen(true);
  }

  async function saveClient() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(editing ? `/api/clients/${editing.id}` : "/api/clients", {
        body: JSON.stringify(form),
        headers: {
          "Content-Type": "application/json",
        },
        method: editing ? "PUT" : "POST",
      });
      const payload = (await response.json()) as { error?: string; success: boolean };

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Client could not be saved.");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  async function deleteClient(client: ClientRecord) {
    if (!window.confirm(`Delete ${client.name}? Existing scans and reports will keep their report data.`)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string; success: boolean };

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Client could not be deleted.");
        return;
      }

      router.refresh();
    });
  }

  if (locked) {
    return (
      <EmptyState
        icon={<Users className="size-5" aria-hidden="true" />}
        title="Client management is available on agency plans."
        description="Upgrade to organize reports by client and use secure client-facing report links."
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={<Users className="size-4" aria-hidden="true" />}
          label="Clients"
          value={String(clients.length)}
          helper="Organized client records"
        />
        <StatCard
          label="Assigned scans"
          value={String(clients.reduce((total, client) => total + (client._count?.scans ?? 0), 0))}
          helper="Scans linked to clients"
        />
        <StatCard
          label="Client reports"
          value={String(clients.reduce((total, client) => total + (client._count?.reports ?? 0), 0))}
          helper="Generated reports linked to clients"
        />
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Clients</CardTitle>
            <CardDescription>
              Manage client records and attach reports without changing scan results.
            </CardDescription>
          </div>
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Add client
          </Button>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, company, email, or website"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {clients.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" aria-hidden="true" />}
              title="No clients yet. Add your first client to organize reports."
            />
          ) : (
            <div className="grid min-w-0 gap-3">
              {filteredClients.map((client) => (
                <article
                  key={client.id}
                  className="grid min-w-0 gap-4 rounded-md border border-border bg-background p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold text-foreground">
                      {client.name}
                    </h3>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {client.companyName ?? "No company set"}
                    </p>
                  </div>
                  <div className="min-w-0 text-sm leading-6 text-muted-foreground">
                    <p className="break-all">{client.contactEmail ?? "No email"}</p>
                    <p className="break-all">{client.website ?? "No website"}</p>
                    <p>Updated {formatDate(client.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button type="button" variant="outline" onClick={() => openEdit(client)}>
                      <Edit3 className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => deleteClient(client)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
              {filteredClients.length === 0 ? (
                <p className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                  No clients match that search.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit client" : "Add client"}</DialogTitle>
            <DialogDescription>
              Client details are private to your account and used to organize reports.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="client-name">
                Client name
              </label>
              <Input
                id="client-name"
                maxLength={80}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="client-company">
                Company name
              </label>
              <Input
                id="client-company"
                value={form.companyName}
                onChange={(event) =>
                  setForm({ ...form, companyName: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="client-email">
                  Contact email
                </label>
                <Input
                  id="client-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) =>
                    setForm({ ...form, contactEmail: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="client-phone">
                  Phone
                </label>
                <Input
                  id="client-phone"
                  maxLength={40}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="client-website">
                Website
              </label>
              <Input
                id="client-website"
                placeholder="https://example.com"
                value={form.website}
                onChange={(event) => setForm({ ...form, website: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="client-notes">
                Notes
              </label>
              <Textarea
                id="client-notes"
                maxLength={1000}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveClient} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
