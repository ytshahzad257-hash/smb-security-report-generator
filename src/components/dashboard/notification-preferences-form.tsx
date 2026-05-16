"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import {
  type NotificationPreferencesActionState,
  updateNotificationPreferencesAction,
} from "@/app/actions/notifications";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initialState: NotificationPreferencesActionState = {};

type ToggleRowProps = {
  defaultChecked: boolean;
  description: string;
  label: string;
  name: string;
};

function ToggleRow({ defaultChecked, description, label, name }: ToggleRowProps) {
  return (
    <label className="flex min-w-0 items-start gap-3 rounded-md border border-border bg-background p-4">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-sm leading-6 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

type NotificationPreferencesFormProps = {
  preferences: {
    paymentEmails: boolean;
    scanEmails: boolean;
    reportEmails: boolean;
    shareEmails: boolean;
    inAppNotifications: boolean;
    marketingEmails: boolean;
  };
};

function NotificationPreferencesForm({ preferences }: NotificationPreferencesFormProps) {
  const [state, formAction, pending] = useActionState(
    updateNotificationPreferencesAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      {state.status === "success" ? (
        <Alert variant="info">
          <div>
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </div>
        </Alert>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <div>
            <AlertTitle>Save failed</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </div>
        </Alert>
      ) : null}

      <ToggleRow
        name="paymentEmails"
        label="Payment emails"
        description="Manual payment, provider payment, and subscription status notifications."
        defaultChecked={preferences.paymentEmails}
      />
      <ToggleRow
        name="scanEmails"
        label="Scan completion emails"
        description="A notification when a website scan completes successfully."
        defaultChecked={preferences.scanEmails}
      />
      <ToggleRow
        name="reportEmails"
        label="PDF report emails"
        description="A notification when a PDF report has been generated."
        defaultChecked={preferences.reportEmails}
      />
      <ToggleRow
        name="shareEmails"
        label="Share link emails"
        description="A confirmation when you create a secure report share link."
        defaultChecked={preferences.shareEmails}
      />
      <ToggleRow
        name="inAppNotifications"
        label="In-app notifications"
        description="Notifications shown in the dashboard bell menu."
        defaultChecked={preferences.inAppNotifications}
      />
      <ToggleRow
        name="marketingEmails"
        label="Marketing emails"
        description="Product announcements or educational emails. Off by default."
        defaultChecked={preferences.marketingEmails}
      />

      <Button type="submit" className="w-full sm:w-fit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        {pending ? "Saving..." : "Save preferences"}
      </Button>
    </form>
  );
}

export { NotificationPreferencesForm };
