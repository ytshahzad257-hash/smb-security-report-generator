import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { REPORTS_PUBLIC_DIR } from "@/lib/reports/pdfGenerator";
import { getPublicShareForToken } from "@/lib/reports/reportSharing";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRateLimitRuleForTier } from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
  rateLimitResponseHeaders,
} from "@/lib/security/rateLimit";

function isPathInsideReportsDir(filePath: string) {
  const reportsDir = path.resolve(REPORTS_PUBLIC_DIR);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(reportsDir, resolvedPath);

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function GET(
  request: Request,
  segmentData: { params: Promise<{ token: string }> },
) {
  const { token } = await segmentData.params;
  const requestContext = await getRequestContext(request);
  const result = await getPublicShareForToken(token);

  if (result.reason === "inactive") {
    return NextResponse.json(
      { error: "This report link is no longer active.", success: false },
      { status: 410 },
    );
  }

  if (result.reason === "expired") {
    return NextResponse.json(
      { error: "This report link has expired.", success: false },
      { status: 410 },
    );
  }

  if (result.reason || !result.share) {
    return NextResponse.json(
      { error: "Report was not found.", success: false },
      { status: result.reason === "password-required" ? 403 : 404 },
    );
  }

  const rule = getRateLimitRuleForTier("FREE_DEMO", "share_download");
  const limit = await checkRateLimit({
    ...rule,
    key: createRateLimitKey({
      action: "share_download",
      ip: requestContext.ip,
      route: "/share/report/[token]/download",
      target: token,
    }),
  });

  if (!limit.allowed) {
    await logAbuseEvent({
      eventType: "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "share_download",
        limit: limit.limit,
        resetAt: limit.resetAt.toISOString(),
        tokenHash: true,
      },
      reason: "Shared report download rate limit triggered.",
      severity: "WARNING",
      target: token,
      userAgent: requestContext.userAgent,
    });

    return NextResponse.json(
      { error: "Too many download attempts. Try again later.", success: false },
      { headers: rateLimitResponseHeaders(limit), status: 429 },
    );
  }

  const { report } = result.share;

  if (report.status !== "GENERATED" || !report.filePath) {
    return NextResponse.json(
      { error: "Report file is not available.", success: false },
      { status: 404 },
    );
  }

  if (!isPathInsideReportsDir(report.filePath)) {
    return NextResponse.json(
      { error: "Report file is not available.", success: false },
      { status: 404 },
    );
  }

  try {
    await stat(report.filePath);
    const file = await readFile(report.filePath);
    const safeDomain = report.scan.rootDomain.replace(/[^a-zA-Z0-9.-]/g, "-");

    return new Response(file, {
      headers: {
        "Content-Disposition": `attachment; filename="smb-security-report-${safeDomain}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Report file is not available.", success: false },
      { status: 404 },
    );
  }
}
