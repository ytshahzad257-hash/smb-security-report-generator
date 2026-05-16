import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { PublicLayout } from "@/components/marketing/public-layout";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to the SMB Security Report Generator dashboard.",
};

export default function LoginPage() {
  return (
    <PublicLayout>
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full min-w-0 max-w-7xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Access your website security posture reports and agency workspace.
            </CardDescription>
          </CardHeader>
          <LoginForm />
        </Card>
      </section>
    </PublicLayout>
  );
}
