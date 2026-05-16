import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  canUseClientManagementForEntitlements,
  getPlanEntitlementsForUser,
} from "@/lib/billing/planEntitlements";
import {
  ClientAccessError,
  createClientForUser,
  listClientsForUser,
  parseClientPayload,
} from "@/lib/clients/clientService";
import { logAbuseEvent } from "@/lib/security/abuseLog";

const CLIENT_MANAGEMENT_BLOCKED_MESSAGE =
  "Client management is not included in your current plan.";

async function requireClientManagementAccess(userId: string, feature: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  if (canUseClientManagementForEntitlements(entitlements)) {
    return null;
  }

  await logAbuseEvent({
    eventType: "PLAN_CLIENT_ACCESS_BLOCKED",
    metadata: {
      feature,
      planId: entitlements.planId,
      planName: entitlements.planName,
      planSlug: entitlements.planSlug ?? null,
      reason: CLIENT_MANAGEMENT_BLOCKED_MESSAGE,
    },
    reason: CLIENT_MANAGEMENT_BLOCKED_MESSAGE,
    severity: "INFO",
    target: "clients",
    userId,
  });

  return NextResponse.json(
    {
      error: CLIENT_MANAGEMENT_BLOCKED_MESSAGE,
      success: false,
    },
    { status: 403 },
  );
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  const blocked = await requireClientManagementAccess(user.id, "client_list");

  if (blocked) {
    return blocked;
  }

  const search = new URL(request.url).searchParams.get("search") ?? undefined;
  const clients = await listClientsForUser(user.id, search);

  return NextResponse.json({ clients, success: true });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  const blocked = await requireClientManagementAccess(user.id, "client_create");

  if (blocked) {
    return blocked;
  }

  try {
    const client = await createClientForUser(user.id, parseClientPayload(await request.json()));

    return NextResponse.json({ client, success: true }, { status: 201 });
  } catch (error) {
    const status = error instanceof ClientAccessError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Client could not be created.";

    return NextResponse.json({ error: message, success: false }, { status });
  }
}
