"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { signup } from "@/app/actions/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/lib/auth-validation";

const initialState: AuthFormState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <>
      <CardContent className="min-w-0">
        <form action={formAction} className="grid gap-4">
          {state.message ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Signup needs attention</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="name">
              Full name
            </label>
            <Input
              id="name"
              name="name"
              placeholder="Alex Morgan"
              autoComplete="name"
              disabled={pending}
              aria-invalid={Boolean(state.errors?.name)}
            />
            <FieldError errors={state.errors?.name} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="signup-email">
              Email
            </label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              placeholder="name@company.com"
              autoComplete="email"
              disabled={pending}
              aria-invalid={Boolean(state.errors?.email)}
            />
            <FieldError errors={state.errors?.email} />
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="signup-password">
                Password
              </label>
              <Input
                id="signup-password"
                name="password"
                type="password"
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                disabled={pending}
                aria-invalid={Boolean(state.errors?.password)}
              />
              <FieldError errors={state.errors?.password} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="confirm-password">
                Confirm password
              </label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                disabled={pending}
                aria-invalid={Boolean(state.errors?.confirmPassword)}
              />
              <FieldError errors={state.errors?.confirmPassword} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="min-w-0 break-words text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-semibold text-foreground hover:underline" href="/login">
            Log in
          </Link>
        </p>
      </CardFooter>
    </>
  );
}

export { SignupForm };
