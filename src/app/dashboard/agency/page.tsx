import type { Metadata } from "next";

import { AgencyBrandingForm } from "@/components/agency/agency-branding-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getAgencyProfileResponse } from "@/lib/agency/agencyProfile";

export const metadata: Metadata = {
  title: "Agency Branding",
  description: "White-label agency branding settings.",
};

export default async function AgencyBrandingPage() {
  const user = await requireUser();
  const data = await getAgencyProfileResponse(user);

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Agency"
        title="Agency White-Label Branding"
        description="Customize client-facing PDF reports with your agency brand."
      />
      <AgencyBrandingForm
        access={data.access}
        defaults={{
          address: data.defaults.address ?? "",
          agencyName: data.defaults.agencyName,
          contactEmail: data.defaults.contactEmail ?? "",
          footerText: data.defaults.footerText,
          logoUrl: null,
          primaryColor: data.defaults.primaryColor,
          secondaryColor: data.defaults.secondaryColor ?? "",
          showPoweredBy: data.defaults.showPoweredBy,
          websiteUrl: data.defaults.websiteUrl ?? "",
        }}
        initialProfile={{
          address: data.profile.address ?? "",
          agencyName: data.profile.agencyName,
          contactEmail: data.profile.contactEmail ?? "",
          footerText: data.profile.footerText,
          logoUrl: data.profile.logoUrl ?? null,
          primaryColor: data.profile.primaryColor,
          secondaryColor: data.profile.secondaryColor ?? "",
          showPoweredBy: data.profile.showPoweredBy,
          websiteUrl: data.profile.websiteUrl ?? "",
        }}
      />
    </div>
  );
}
