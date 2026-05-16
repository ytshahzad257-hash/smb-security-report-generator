"use client";

import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  submitManualPaymentRequest,
  type ManualPaymentState,
} from "@/app/actions/billing";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ManualPaymentMethod, ManualPaymentOption } from "@/lib/manual-payments";

type ManualPaymentFormProps = {
  methods: ManualPaymentMethod[];
  options: ManualPaymentOption[];
};

const initialState: ManualPaymentState = {};

function formatPrice(amount: string, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function ManualPaymentForm({ methods, options }: ManualPaymentFormProps) {
  const router = useRouter();
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? "");
  const [selectedMethodId, setSelectedMethodId] = useState(methods[0]?.id ?? "");
  const [state, formAction, pending] = useActionState(
    submitManualPaymentRequest,
    initialState,
  );
  const selectedOption = useMemo(
    () => options.find((option) => option.id === selectedOptionId),
    [options, selectedOptionId],
  );
  const selectedMethod = methods.find((method) => method.id === selectedMethodId);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={formAction} className="grid gap-5">
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          {state.status === "success" ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4" aria-hidden="true" />
          )}
          <div>
            <AlertTitle>
              {state.status === "success" ? "Request submitted" : "Request failed"}
            </AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="optionId">
            Plan or package
          </label>
          <input type="hidden" name="optionId" value={selectedOptionId} />
          <Select value={selectedOptionId} onValueChange={setSelectedOptionId}>
            <SelectTrigger id="optionId">
              <SelectValue placeholder="Select plan or credits" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name} - {formatPrice(option.amount, option.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="paymentMethod">
            Payment method
          </label>
          <input type="hidden" name="paymentMethod" value={selectedMethodId} />
          <Select
            value={selectedMethodId}
            onValueChange={setSelectedMethodId}
            disabled={methods.length === 0}
          >
            <SelectTrigger id="paymentMethod">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              {methods.map((method) => (
                <SelectItem key={method.id} value={method.id}>
                  {method.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedOption ? (
        <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{selectedOption.name}</span>
            <span className="font-semibold text-foreground">
              {formatPrice(selectedOption.amount, selectedOption.currency)}
            </span>
          </div>
          <p className="text-muted-foreground">
            Includes {selectedOption.reportCredits} report credits
            {selectedOption.type === "PLAN" ? " and plan access after approval." : "."}
          </p>
        </div>
      ) : null}

      {methods.length > 0 ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium text-foreground">Configured methods</p>
          <div className="grid gap-3 md:grid-cols-3">
            {methods.map((method) => (
              <div
                key={method.id}
                className="grid gap-1 rounded-md border border-border bg-background p-3 text-sm"
              >
                <p className="font-semibold text-foreground">{method.label}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {method.serviceName}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedMethod ? (
        <div className="grid gap-2 rounded-md border border-border p-4 text-sm">
          <div className="grid gap-1">
            <p className="font-semibold text-foreground">{selectedMethod.label}</p>
            <p className="text-muted-foreground">
              {selectedMethod.instructions}
            </p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Title</dt>
              <dd className="break-words font-semibold text-foreground">
                {selectedMethod.accountTitle}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Account</dt>
              <dd className="break-words font-semibold text-foreground">
                {selectedMethod.accountNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Service</dt>
              <dd className="break-words font-semibold text-foreground">
                {selectedMethod.serviceName}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="transactionReference">
            Transaction reference
          </label>
          <Input id="transactionReference" name="transactionReference" maxLength={120} />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="payerName">
            Payer name
          </label>
          <Input id="payerName" name="payerName" maxLength={120} />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="payerPhone">
            Payer phone
          </label>
          <Input id="payerPhone" name="payerPhone" maxLength={40} />
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor="proof">
          Proof of payment
        </label>
        <Input
          id="proof"
          name="proof"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          required
        />
        <p className="text-xs leading-5 text-muted-foreground">
          PNG, JPG, WebP, or PDF. Maximum file size is 5 MB.
        </p>
      </div>

      <Button
        type="submit"
        className="w-full sm:w-fit"
        disabled={pending || !selectedOptionId || !selectedMethodId}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Upload aria-hidden="true" />
        )}
        {pending ? "Submitting..." : "Submit payment proof"}
      </Button>
    </form>
  );
}

export { ManualPaymentForm };
