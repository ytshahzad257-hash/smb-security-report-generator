import { NextResponse } from "next/server";

import { enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";
import { approveManualPaymentRequest } from "@/lib/manual-payments";
import { notifyManualPaymentApproved } from "@/lib/email/notifications";

export async function PATCH(
  _request: Request,
  context: RouteContext<"/api/admin/payments/[id]/approve">,
) {
  const auth = await requireAdminApi(_request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request: _request,
    route: "/api/admin/payments/[id]/approve",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;

  try {
    const result = await approveManualPaymentRequest(auth.user.id, id);

    if (!result.alreadyApproved) {
      await notifyManualPaymentApproved(result.request.id);
    }

    return NextResponse.json({
      message: result.alreadyApproved
        ? "Payment request already approved."
        : "Payment request approved.",
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment request could not be approved.",
        success: false,
      },
      { status: 400 },
    );
  }
}
