import { FeaturesSection } from "@/components/marketing/features-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { PricingPreview } from "@/components/marketing/pricing-preview";
import { PublicLayout } from "@/components/marketing/public-layout";
import { SampleReportCta } from "@/components/marketing/sample-report-cta";

export default function Home() {
  return (
    <PublicLayout>
      <HeroSection />
      <FeaturesSection />
      <PricingPreview />
      <SampleReportCta />
    </PublicLayout>
  );
}
