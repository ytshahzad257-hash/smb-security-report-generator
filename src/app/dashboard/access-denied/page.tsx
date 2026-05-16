import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Access denied",
};

export default function AccessDeniedPage() {
  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <Card>
        <CardHeader>
          <div className="flex size-11 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ShieldAlert aria-hidden="true" />
          </div>
          <CardTitle>Access denied</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            This section is restricted to internal administrators.
          </p>
          <Button asChild>
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
