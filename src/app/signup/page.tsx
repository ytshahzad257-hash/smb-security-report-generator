import type { Metadata } from "next";
import { Building2, ShieldCheck } from "lucide-react";

import { SignupForm } from "@/components/auth/signup-form";
import { PublicLayout } from "@/components/marketing/public-layout";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create an SMB Security Report Generator workspace.",
};

export default function SignupPage() {
  return (
    <PublicLayout>
      <section className="mx-auto grid min-h-[calc(100vh-8rem)] w-full min-w-0 max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:px-8">
        <div className="min-w-0">
          <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
            Create your report workspace
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Set up the professional dashboard foundation for website posture
            reports, branded outputs, and future agency workflows.
          </p>
          <div className="mt-8 min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Building2 className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Built for service providers</p>
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  Agencies, freelancers, ecommerce teams, and software houses can
                  present clear posture reports without implying penetration
                  testing.
                </p>
              </div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Workspace details</CardTitle>
            <CardDescription>
              Create your user account. Agency workspace details can be added later.
            </CardDescription>
          </CardHeader>
          <SignupForm />
        </Card>
      </section>
    </PublicLayout>
  );
}
