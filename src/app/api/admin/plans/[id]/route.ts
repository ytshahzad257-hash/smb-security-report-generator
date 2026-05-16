import { NextResponse } from "next/server";

import { createAdminAuditLog, enforceAdminWriteRateLimit, requireAdminApi } from "@/lib/admin";
import {
  buildPlanUpdateInputFromPlan,
  buildPlanAuditMetadata,
  parsePlanUpdateInput,
  toPlanUpdateData,
} from "@/lib/admin-plan-update";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/plans/[id]">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const limited = await enforceAdminWriteRateLimit({
    request,
    route: "/api/admin/plans/[id]",
    userId: auth.user.id,
  });
  if (limited.response) return limited.response;

  const { id } = await context.params;
  const prisma = getPrisma();
  const existingPlan = await prisma.plan.findUnique({ where: { id } });

  if (!existingPlan) {
    return NextResponse.json(
      { error: "Plan not found.", success: false },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parsePlanUpdateInput({
    ...buildPlanUpdateInputFromPlan(existingPlan),
    ...body,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid plan update.",
        fieldErrors: parsed.errors,
        success: false,
      },
      { status: 400 },
    );
  }

  const updateData = toPlanUpdateData(parsed.data, existingPlan);
  const plan = await prisma.plan.update({ where: { id }, data: updateData });
  const auditMetadata = buildPlanAuditMetadata({
    before: existingPlan,
    afterData: updateData,
    planId: id,
    planName: parsed.data.name,
    warnings: parsed.warnings,
  });

  await createAdminAuditLog({
    adminUserId: auth.user.id,
    action: "PLAN_UPDATED",
    targetType: "Plan",
    targetId: id,
    metadata: auditMetadata,
  });

  return NextResponse.json({
    changedFields: auditMetadata.changedFields,
    plan: { ...plan, price: plan.price.toString() },
    success: true,
    warnings: parsed.warnings,
  });
}
