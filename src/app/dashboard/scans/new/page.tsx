import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";

import { NewScanForm } from "@/components/scans/new-scan-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { canManageClients } from "@/lib/billing";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "New Scan",
  description: "Submit a website URL for future scanning.",
};

export default async function NewScanPage({
  searchParams,
}: {
  searchParams: Promise<{ targetUrl?: string; scanType?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const initialScanType =
    params.scanType === "PROFESSIONAL" || params.scanType === "BASIC"
      ? params.scanType
      : "BASIC";
  const prisma = getPrisma();
  const clients = (await canManageClients(user.id))
    ? await prisma.client.findMany({
        where: {
          userId: user.id,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          companyName: true,
          id: true,
          name: true,
        },
      })
    : [];

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Scans"
        title="New scan"
        description="Submit a public website URL for future safe posture checks."
      />

      <Alert variant="warning">
        <AlertCircle className="size-4" aria-hidden="true" />
        <div>
          <AlertTitle>Authorization required</AlertTitle>
          <AlertDescription>
            Only scan websites you own or are authorized to assess.
          </AlertDescription>
        </div>
      </Alert>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Scan target</CardTitle>
          <CardDescription>
            Phase 5 creates a pending scan record after URL and SSRF safety checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewScanForm
            clients={clients}
            initialScanType={initialScanType}
            initialTargetUrl={params.targetUrl ?? ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
