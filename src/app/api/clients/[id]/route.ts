import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  canUseClientManagementForEntitlements,
  getPlanEntitlementsForUser,
} from "@/lib/billing/planEntitlements";
import {
  ClientAccessError,
  deleteClientForUser,
  getOwnedClient,
  parseClientPayload,
  updateClientForUser,
} from "@/lib/clients/clientService";
import { logAbuseEvent } from "@/lib/security/abuseLog";

const CLIENT_MANAGEMENT_BLOCKED_MESSAGE =
  "Client management is not included in your current plan.";

async function requireClientAccess(userId: string, feature: string) {
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

export async function GET(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  const blocked = await requireClientAccess(user.id, "client_view");

  if (blocked) {
    return blocked;
  }

  const { id } = await segmentData.params;
  const client = await getOwnedClient(user.id, id);

  if (!client) {
    return NextResponse.json({ error: "Client was not found.", success: false }, { status: 404 });
  }

  return NextResponse.json({ client, success: true });
}

export async function PUT(
  request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  const blocked = await requireClientAccess(user.id, "client_update");

  if (blocked) {
    return blocked;
  }

  try {
    const { id } = await segmentData.params;
    const client = await updateClientForUser(
      user.id,
      id,
      parseClientPayload(await request.json()),
    );

    return NextResponse.json({ client, success: true });
  } catch (error) {
    const status = error instanceof ClientAccessError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Client could not be updated.";

    return NextResponse.json({ error: message, success: false }, { status });
  }
}

export async function DELETE(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required.", success: false }, { status: 401 });
  }

  const blocked = await requireClientAccess(user.id, "client_delete");

  if (blocked) {
    return blocked;
  }

  try {
    const { id } = await segmentData.params;

    await deleteClientForUser(user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof ClientAccessError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Client could not be deleted.";

    return NextResponse.json({ error: message, success: false }, { status });
  }
}
