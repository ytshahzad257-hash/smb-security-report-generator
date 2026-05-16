import { NextResponse } from "next/server";

import { enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";
import { rejectManualPaymentRequest } from "@/lib/manual-payments";
import { notifyManualPaymentRejected } from "@/lib/email/notifications";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/payments/[id]/reject">,
) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/payments/[id]/reject",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim() : "";

  if (adminNote.length < 3) {
    return NextResponse.json(
      { error: "Enter a rejection reason.", success: false },
      { status: 400 },
    );
  }

  try {
    const paymentRequest = await rejectManualPaymentRequest(auth.user.id, id, adminNote);

    await notifyManualPaymentRejected(paymentRequest.id);

    return NextResponse.json({
      message: "Payment request rejected.",
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment request could not be rejected.",
        success: false,
      },
      { status: 400 },
    );
  }
}
