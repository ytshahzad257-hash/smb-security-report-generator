import type { Metadata } from "next";

import { PlanEditorCard } from "@/components/admin/plan-editor-card";
import { PageHeader } from "@/components/ui/page-header";
import { buildPlanUpdateInputFromPlan } from "@/lib/admin-plan-update";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin Plans" };

export default async function AdminPlansPage() {
  const prisma = getPrisma();
  const plans = await prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { price: "asc" }] });

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Plans"
        description="Edit pricing, scan/PDF limits, manual review, feature access, and payment provider IDs."
      />
      <div className="grid gap-4">
        {plans.map((plan) => {
          return (
            <PlanEditorCard
              key={plan.id}
              plan={{
                id: plan.id,
                slug: plan.slug,
                values: buildPlanUpdateInputFromPlan(plan),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
