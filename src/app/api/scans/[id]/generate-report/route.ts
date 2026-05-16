import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { getUserSubscription } from "@/lib/billing";
import { getPrisma } from "@/lib/prisma";
import { ReportGenerationError } from "@/lib/reports/reportData";
import { generateReportForScan } from "@/lib/reports/reportService";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import {
  getLimitTierForPlanSlug,
  getRateLimitRuleForTier,
} from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
  rateLimitResponseHeaders,
} from "@/lib/security/rateLimit";

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }
  await assertActiveUser(user.id);

  const { id } = await segmentData.params;
  const requestContext = await getRequestContext(request);
  const subscription = await getUserSubscription(user.id);
  const tier = getLimitTierForPlanSlug(subscription.plan.slug, user.role);
  const rule = getRateLimitRuleForTier(tier, "pdf_generate");
  const limit = await checkRateLimit({
    ...rule,
    key: createRateLimitKey({
      action: "pdf_generate",
      ip: requestContext.ip,
      route: "/api/scans/[id]/generate-report",
      target: id,
      userId: user.id,
    }),
  });

  if (!limit.allowed) {
    await logAbuseEvent({
      eventType: "PDF_RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "pdf_generate",
        limit: limit.limit,
        resetAt: limit.resetAt.toISOString(),
        tier,
      },
      reason: "PDF generation rate limit triggered.",
      severity: "WARNING",
      target: id,
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return NextResponse.json(
      {
        error: "PDF generation is temporarily rate-limited.",
        resetAt: limit.resetAt.toISOString(),
        success: false,
      },
      { headers: rateLimitResponseHeaders(limit), status: 429 },
    );
  }

  try {
    const prisma = getPrisma();
    const scan = await prisma.scan.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!scan) {
      return NextResponse.json(
        { error: "Scan was not found.", success: false },
        { status: 404 },
      );
    }

    const result = await generateReportForScan(id, user.id);

    return NextResponse.json({
      downloadUrl: result.downloadUrl,
      reportId: result.reportId,
      success: true,
    });
  } catch (error) {
    const message =
      error instanceof ReportGenerationError && error.code === "NOT_COMPLETED"
        ? "Scan must be completed before generating PDF."
        : error instanceof Error
          ? error.message
          : "PDF generation failed.";
    const status =
      error instanceof ReportGenerationError && error.code === "NOT_FOUND"
        ? 404
        : error instanceof ReportGenerationError &&
            error.code === "PLAN_ACCESS_DENIED"
          ? 403
        : error instanceof ReportGenerationError && error.code === "NO_CREDITS"
          ? 402
          : error instanceof ReportGenerationError &&
              (error.code === "NOT_COMPLETED" || error.code === "MISSING_SCORE")
            ? 400
            : 500;

    return NextResponse.json(
      {
        error: message,
        success: false,
      },
      { status },
    );
  }
}
