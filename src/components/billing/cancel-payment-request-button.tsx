"use client";

import { Loader2, XCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

function CancelSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <XCircle />}
      {pending ? "Cancelling..." : "Cancel"}
    </Button>
  );
}

export { CancelSubmitButton };
