import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  canUseClientManagementForEntitlements,
  getPlanEntitlementsForUser,
} from "@/lib/billing/planEntitlements";
import { getOwnedClient } from "@/lib/clients/clientService";
import { getPrisma } from "@/lib/prisma";
import { logAbuseEvent } from "@/lib/security/abuseLog";

const CLIENT_MANAGEMENT_BLOCKED_MESSAGE =
  "Client management is not included in your current plan.";

const assignClientSchema = z.object({
  clientId: z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : null)),
  ),
});

export async function PATCH(
  request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  const entitlements = await getPlanEntitlementsForUser(user.id);

  if (!canUseClientManagementForEntitlements(entitlements)) {
    await logAbuseEvent({
      eventType: "PLAN_CLIENT_ACCESS_BLOCKED",
      metadata: {
        feature: "scan_client_assignment",
        planId: entitlements.planId,
        planName: entitlements.planName,
        planSlug: entitlements.planSlug ?? null,
        reason: CLIENT_MANAGEMENT_BLOCKED_MESSAGE,
      },
      reason: CLIENT_MANAGEMENT_BLOCKED_MESSAGE,
      severity: "INFO",
      target: "scan-client-assignment",
      userId: user.id,
    });

    return NextResponse.json(
      {
        error: CLIENT_MANAGEMENT_BLOCKED_MESSAGE,
        success: false,
      },
      { status: 403 },
    );
  }

  const payload = assignClientSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid client assignment.", success: false }, { status: 400 });
  }

  const { id } = await segmentData.params;
  const client = payload.data.clientId
    ? await getOwnedClient(user.id, payload.data.clientId)
    : null;

  if (payload.data.clientId && !client) {
    return NextResponse.json({ error: "Client was not found.", success: false }, { status: 404 });
  }

  const prisma = getPrisma();
  const existingScan = await prisma.scan.findFirst({
    where: {
      id,
      userId: user.id,
    },
    select: {
      id: true,
      scanType: true,
    },
  });

  if (!existingScan) {
    return NextResponse.json({ error: "Scan was not found.", success: false }, { status: 404 });
  }

  if (existingScan.scanType === "BASIC") {
    return NextResponse.json(
      {
        error: "Client assignment is available with Professional Scan.",
        success: false,
      },
      { status: 403 },
    );
  }

  const result = await prisma.scan.updateMany({
    where: {
      id,
      userId: user.id,
    },
    data: {
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Scan was not found.", success: false }, { status: 404 });
  }

  await prisma.report.updateMany({
    where: {
      scanId: id,
      userId: user.id,
    },
    data: {
      clientId: client?.id ?? null,
      clientName: client?.name ?? null,
    },
  });

  return NextResponse.json({ success: true });
}
