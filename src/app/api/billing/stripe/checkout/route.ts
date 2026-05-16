import { NextResponse } from "next/server";
import { z } from "zod";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import {
  createStripeCheckoutForUser,
  safeStripeErrorMessage,
} from "@/lib/stripe-billing";
import { StripeConfigError } from "@/lib/stripe";

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
    const session = await createStripeCheckoutForUser({
      user,
      checkout: parsed.data,
      requestUrl: request.url,
    });

    return NextResponse.json({ ...session, success: true });
  } catch (error) {
    const status = error instanceof StripeConfigError ? 503 : 400;

    return NextResponse.json(
      {
        error: safeStripeErrorMessage(error) || "Checkout session creation failed.",
        success: false,
      },
      { status },
    );
  }
}
