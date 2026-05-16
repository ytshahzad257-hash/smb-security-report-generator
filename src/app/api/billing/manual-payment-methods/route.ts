import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getManualPaymentMethods } from "@/lib/manual-payments";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  return NextResponse.json({
    methods: getManualPaymentMethods(),
    success: true,
  });
}
