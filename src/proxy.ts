import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/payment-proofs/")) {
    return new NextResponse("Not found", {
      status: 404,
      headers: {
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/payment-proofs/:path*"],
};
