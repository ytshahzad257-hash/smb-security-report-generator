"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { login } from "@/app/actions/auth";
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

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <>
      <CardContent className="min-w-0">
        <form action={formAction} className="grid gap-4">
          {state.message ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Login failed</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@company.com"
              autoComplete="email"
              disabled={pending}
              aria-invalid={Boolean(state.errors?.email)}
            />
            <FieldError errors={state.errors?.email} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Enter password"
              autoComplete="current-password"
              disabled={pending}
              aria-invalid={Boolean(state.errors?.password)}
            />
            <FieldError errors={state.errors?.password} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {pending ? "Logging in..." : "Log in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="min-w-0 break-words text-center text-sm text-muted-foreground">
          New to the platform?{" "}
          <Link className="font-semibold text-foreground hover:underline" href="/signup">
            Create an account
          </Link>
        </p>
      </CardFooter>
    </>
  );
}

export { LoginForm };
