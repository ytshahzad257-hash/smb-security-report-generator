import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { readPaymentProof } from "@/lib/manual-payments";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/billing/payment-proof/request/[id]">,
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const prisma = getPrisma();
  const paymentRequest = await prisma.manualPaymentRequest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      proofPath: true,
    },
  });

  if (!paymentRequest || (paymentRequest.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json(
      { error: "Payment proof not found.", success: false },
      { status: 404 },
    );
  }

  const proof = await readPaymentProof(paymentRequest.proofPath);

  if (!proof) {
    return NextResponse.json(
      { error: "Payment proof not found.", success: false },
      { status: 404 },
    );
  }

  return new NextResponse(proof.bytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="payment-proof-${paymentRequest.id}"`,
      "Content-Type": proof.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
