import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole, UserStatus } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRequestContext } from "@/lib/security/rateLimit";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();

  if (!session?.userId) {
    return null;
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin() {
  return requireAdminUser();
}

export async function logUnauthorizedAdminAccess(input: {
  userId?: string;
  target?: string;
  reason: string;
  request?: Request;
}) {
  const requestContext = input.request
    ? await getRequestContext(input.request)
    : { ip: null, userAgent: null };

  await logAbuseEvent({
    eventType: "UNAUTHORIZED_ADMIN_ACCESS",
    ipAddress: requestContext.ip,
    reason: input.reason,
    severity: "HIGH",
    target: input.target,
    userAgent: requestContext.userAgent,
    userId: input.userId,
  });
}

export async function requireAdminUser(target = "/dashboard/admin") {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    await logUnauthorizedAdminAccess({
      userId: user.id,
      target,
      reason: "Authenticated non-admin attempted to access admin area.",
    });
    redirect("/dashboard/access-denied");
  }

  return user;
}

export async function assertActiveUser(userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (user?.status === "SUSPENDED") {
    throw new Error("This account is suspended.");
  }
}
