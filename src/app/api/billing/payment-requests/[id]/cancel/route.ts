import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { cancelManualPaymentRequest } from "@/lib/manual-payments";

export async function PATCH(
  _request: Request,
  context: RouteContext<"/api/billing/payment-requests/[id]/cancel">,
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  try {
    await cancelManualPaymentRequest(user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment request could not be cancelled.",
        success: false,
      },
      { status: 400 },
    );
  }
}
