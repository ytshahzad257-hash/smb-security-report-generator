"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { loginSchema, signupSchema, type AuthFormState } from "@/lib/auth-validation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRateLimitRuleForTier, type RateLimitAction } from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
  hashRateLimitPart,
} from "@/lib/security/rateLimit";
import { createSession, deleteSession } from "@/lib/session";

const genericLoginError = "Invalid email or password.";
const authLimitError = "Too many attempts. Try again later.";

async function checkAuthRateLimit(action: Extract<RateLimitAction, "auth_login" | "auth_signup">) {
  const requestContext = await getRequestContext();
  const rule = getRateLimitRuleForTier("FREE_DEMO", action);
  const limit = await checkRateLimit({
    ...rule,
    key: createRateLimitKey({
      action,
      ip: requestContext.ip,
      route: action,
    }),
  });

  if (!limit.allowed) {
    await logAbuseEvent({
      eventType: "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action,
        limit: limit.limit,
        resetAt: limit.resetAt.toISOString(),
      },
      reason: "Authentication rate limit triggered.",
      severity: "WARNING",
      target: action,
      userAgent: requestContext.userAgent,
    });
  }

  return { limit, requestContext };
}

export async function signup(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const authLimit = await checkAuthRateLimit("auth_signup");

  if (!authLimit.limit.allowed) {
    return { message: authLimitError };
  }

  const validatedFields = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, email, password } = validatedFields.data;
  const passwordHash = await hashPassword(password);
  const prisma = getPrisma();

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: "USER",
      },
      select: {
        id: true,
        role: true,
      },
    });

    await createSession({ userId: user.id, role: user.role });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { email: ["An account with this email already exists."] },
        message: "Please use a different email or log in.",
      };
    }

    return {
      message: "We could not create your account. Please try again.",
    };
  }

  redirect("/dashboard");
}

export async function login(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const authLimit = await checkAuthRateLimit("auth_login");

  if (!authLimit.limit.allowed) {
    return { message: authLimitError };
  }

  const validatedFields = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Please fix the highlighted fields.",
    };
  }

  const { email, password } = validatedFields.data;
  const emailHash = hashRateLimitPart(email.toLowerCase());
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      passwordHash: true,
      role: true,
    },
  });

  if (!user) {
    await logAbuseEvent({
      eventType: "FAILED_AUTH_ATTEMPTS",
      ipAddress: authLimit.requestContext.ip,
      metadata: { emailHash },
      reason: "Login failed for unknown account.",
      severity: "INFO",
      target: "auth-login",
      userAgent: authLimit.requestContext.userAgent,
    });

    return { message: genericLoginError };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    await logAbuseEvent({
      eventType: "FAILED_AUTH_ATTEMPTS",
      ipAddress: authLimit.requestContext.ip,
      metadata: {
        emailHash,
        userId: user.id,
      },
      reason: "Login failed for existing account.",
      severity: "INFO",
      target: "auth-login",
      userAgent: authLimit.requestContext.userAgent,
      userId: user.id,
    });

    return { message: genericLoginError };
  }

  await createSession({ userId: user.id, role: user.role });
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
