import { NextResponse } from "next/server";
import { z } from "zod";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { LemonConfigError, safeLemonErrorMessage } from "@/lib/lemon";
import { createLemonCheckoutForUser } from "@/lib/lemon-billing";

const checkoutSchema = z
  .object({
    planId: z.string().trim().min(1).optional(),
    packageId: z.string().trim().min(1).optional(),
    successUrl: z.string().trim().max(500).optional(),
    cancelUrl: z.string().trim().max(500).optional(),
  })
  .refine((value) => Boolean(value.planId) !== Boolean(value.packageId), {
    message: "Select either a plan or a credit package.",
  });

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid checkout request.",
        success: false,
      },
      { status: 400 },
    );
  }

  try {
    const checkout = await createLemonCheckoutForUser({
      user,
      checkout: parsed.data,
      requestUrl: request.url,
    });

    return NextResponse.json({ ...checkout, success: true });
  } catch (error) {
    const status = error instanceof LemonConfigError ? 503 : 400;
    const message =
      error instanceof LemonConfigError
        ? "International card payment is not configured yet."
        : safeLemonErrorMessage(error) || "Checkout creation failed.";

    return NextResponse.json(
      {
        error: message,
        success: false,
      },
      { status },
    );
  }
}
