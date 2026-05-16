import {
  Building2,
  ClipboardCheck,
  FileText,
  Gauge,
  MailCheck,
  ShieldCheck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

const features = [
  {
    title: "Safe URL checks",
    description:
      "Designed around website configuration review, not exploit testing or aggressive crawling.",
    icon: ShieldCheck,
  },
  {
    title: "Client-ready reports",
    description:
      "A foundation for branded PDF reports with concise findings and recommended fixes.",
    icon: FileText,
  },
  {
    title: "Agency workflow",
    description:
      "Layouts for repeatable report delivery, future white-label profiles, plans, and credits.",
    icon: Building2,
  },
  {
    title: "Mail posture checks",
    description:
      "Prepared for SPF, DMARC, MX, and basic DKIM selector review in later phases.",
    icon: MailCheck,
  },
  {
    title: "OWASP mapping",
    description:
      "Report sections can map safe observations to familiar security checklist language.",
    icon: ClipboardCheck,
  },
  {
    title: "Risk score display",
    description:
      "Dashboard components are ready for transparent scores, trends, and issue summaries.",
    icon: Gauge,
  },
];

function FeaturesSection() {
  return (
    <section className="bg-background py-16 sm:py-20">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Platform foundation"
          title="Built for professional security posture reporting"
          description="A responsive product shell for safe scan categories, report views, agency workflows, and billing surfaces."
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="h-full">
              <CardHeader>
                <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <feature.icon className="size-5" aria-hidden="true" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export { FeaturesSection };
