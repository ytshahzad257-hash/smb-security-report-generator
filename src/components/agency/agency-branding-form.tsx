"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ImageIcon, Lock, RotateCcw, Save, Trash2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type BrandingFormState = {
  agencyName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  contactEmail: string;
  websiteUrl: string;
  address: string;
  footerText: string;
  showPoweredBy: boolean;
};

type AgencyBrandingFormProps = {
  access: {
    canRemovePoweredBy: boolean;
    canUseWhiteLabel: boolean;
    plan: {
      name: string;
      slug: string;
    };
  };
  defaults: BrandingFormState;
  initialProfile: BrandingFormState;
};

type SaveResponse = {
  errors?: Record<string, string>;
  error?: string;
  profile?: Partial<BrandingFormState>;
  warning?: string;
  success: boolean;
};

function normalizeProfile(profile: Partial<BrandingFormState>, fallback: BrandingFormState) {
  return {
    address: profile.address ?? fallback.address ?? "",
    agencyName: profile.agencyName ?? fallback.agencyName,
    contactEmail: profile.contactEmail ?? fallback.contactEmail ?? "",
    footerText: profile.footerText ?? fallback.footerText,
    logoUrl: profile.logoUrl ?? fallback.logoUrl ?? null,
    primaryColor: profile.primaryColor ?? fallback.primaryColor,
    secondaryColor: profile.secondaryColor ?? fallback.secondaryColor ?? "",
    showPoweredBy: profile.showPoweredBy ?? fallback.showPoweredBy,
    websiteUrl: profile.websiteUrl ?? fallback.websiteUrl ?? "",
  };
}

export function AgencyBrandingForm({
  access,
  defaults,
  initialProfile,
}: AgencyBrandingFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState(() => normalizeProfile(initialProfile, defaults));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLogoPending, startLogoTransition] = useTransition();

  function updateField<Key extends keyof BrandingFormState>(
    key: Key,
    value: BrandingFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveBranding(reset = false) {
    setError(null);
    setErrors({});
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/agency/profile", {
        body: JSON.stringify(reset ? { reset: true } : form),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json()) as SaveResponse;

      if (!response.ok || !payload.success) {
        setErrors(payload.errors ?? {});
        setError(payload.error ?? "Agency branding could not be saved.");
        return;
      }

      if (payload.profile) {
        setForm(normalizeProfile(payload.profile, defaults));
      }

      setMessage(payload.warning ?? (reset ? "Branding reset to defaults." : "Branding saved."));
    });
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) {
      return;
    }

    setError(null);
    setMessage(null);

    startLogoTransition(async () => {
      const body = new FormData();
      body.append("logo", file);
      const response = await fetch("/api/agency/logo", {
        body,
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        logoUrl?: string;
        success: boolean;
      };

      if (!response.ok || !payload.success || !payload.logoUrl) {
        setError(payload.error ?? "Logo upload failed.");
        return;
      }

      setForm((current) => ({ ...current, logoUrl: payload.logoUrl ?? null }));
      setMessage("Logo uploaded.");
    });
  }

  async function removeLogo() {
    setError(null);
    setMessage(null);

    startLogoTransition(async () => {
      const response = await fetch("/api/agency/logo", { method: "DELETE" });
      const payload = (await response.json()) as { error?: string; success: boolean };

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Logo could not be removed.");
        return;
      }

      setForm((current) => ({ ...current, logoUrl: null }));
      setMessage("Logo removed.");
    });
  }

  const locked = !access.canUseWhiteLabel;
  const busy = isPending || isLogoPending;

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Agency White-Label Branding</CardTitle>
              <CardDescription>
                Customize client-facing PDF reports with your agency brand.
              </CardDescription>
            </div>
            <Badge variant={locked ? "outline" : "success"}>
              {locked ? "Locked" : access.plan.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5">
          {locked ? (
            <Alert>
              <Lock className="size-4" aria-hidden="true" />
              <AlertDescription>
                Agency branding is available on agency plans.
              </AlertDescription>
            </Alert>
          ) : null}

          {message ? (
            <Alert variant="info">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label="Agency name" error={errors.agencyName}>
              <Input
                disabled={locked || busy}
                value={form.agencyName}
                onChange={(event) => updateField("agencyName", event.target.value)}
              />
            </Field>

            <Field label="Logo">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => uploadLogo(event.target.files?.[0])}
                disabled={locked || busy}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={locked || busy}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  {isLogoPending ? "Uploading..." : "Upload logo"}
                </Button>
                {form.logoUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={removeLogo}
                    disabled={locked || busy}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Remove logo
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field label="Primary brand color" error={errors.primaryColor}>
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
                <Input
                  type="color"
                  disabled={locked || busy}
                  value={form.primaryColor}
                  onChange={(event) => updateField("primaryColor", event.target.value)}
                  className="p-1"
                />
                <Input
                  disabled={locked || busy}
                  value={form.primaryColor}
                  onChange={(event) => updateField("primaryColor", event.target.value)}
                />
              </div>
            </Field>

            <Field label="Secondary color" error={errors.secondaryColor}>
              <Input
                disabled={locked || busy}
                placeholder="#2563eb"
                value={form.secondaryColor}
                onChange={(event) => updateField("secondaryColor", event.target.value)}
              />
            </Field>

            <Field label="Contact email" error={errors.contactEmail}>
              <Input
                disabled={locked || busy}
                value={form.contactEmail}
                onChange={(event) => updateField("contactEmail", event.target.value)}
              />
            </Field>

            <Field label="Website" error={errors.websiteUrl}>
              <Input
                disabled={locked || busy}
                placeholder="https://agency.example"
                value={form.websiteUrl}
                onChange={(event) => updateField("websiteUrl", event.target.value)}
              />
            </Field>

            <Field label="Address" error={errors.address}>
              <Input
                disabled={locked || busy}
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
              />
            </Field>

            <Field label="Footer text" error={errors.footerText}>
              <Input
                disabled={locked || busy}
                value={form.footerText}
                onChange={(event) => updateField("footerText", event.target.value)}
              />
            </Field>
          </div>

          {access.canRemovePoweredBy ? (
            <label className="flex min-w-0 items-start gap-3 rounded-md border border-border bg-background p-4 text-sm">
              <input
                type="checkbox"
                checked={!form.showPoweredBy}
                disabled={locked || busy}
                onChange={(event) => updateField("showPoweredBy", !event.target.checked)}
                className="mt-1 size-4"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">
                  Hide powered-by branding
                </span>
                <span className="block break-words text-muted-foreground">
                  The required PDF safety disclaimer remains visible.
                </span>
              </span>
            </label>
          ) : (
            <Alert>
              <AlertDescription>
                Powered-by branding can be removed on Agency Pro plans.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => saveBranding(false)}
              disabled={locked || busy}
            >
              <Save className="size-4" aria-hidden="true" />
              {isPending ? "Saving..." : "Save branding"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => saveBranding(true)}
              disabled={locked || busy}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>Mini report cover preview.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid min-w-0 gap-5 rounded-md border border-border bg-card p-5 text-card-foreground">
            <div className="flex min-w-0 items-center gap-3">
              {form.logoUrl ? (
                <Image
                  src={form.logoUrl}
                  alt=""
                  width={96}
                  height={42}
                  className="max-h-12 w-auto object-contain"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">
                  {form.agencyName || "Agency"}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {form.websiteUrl || form.contactEmail || "Client reporting"}
                </p>
              </div>
            </div>
            <div className="h-1 rounded-full" style={{ backgroundColor: form.primaryColor }} />
            <div>
              <h3 className="break-words text-xl font-semibold leading-tight">
                Website Security Posture Report
              </h3>
              <p className="mt-2 break-words text-sm text-muted-foreground">
                example.com
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: form.primaryColor }}
              >
                85/100
              </span>
              <span className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold">
                Grade B
              </span>
            </div>
            <p className="break-words border-l-4 border-border bg-muted p-3 text-xs leading-5 text-muted-foreground">
              This report is based on automated safe checks only. It is not a
              penetration test, security certification, or full OWASP compliance
              audit.
            </p>
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <p className="break-words">{form.footerText}</p>
              {form.showPoweredBy ? (
                <p className="mt-1">Powered by SMB Security Report Generator</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </label>
  );
}
