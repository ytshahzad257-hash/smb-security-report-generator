import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import type { ManualPaymentRequestStatus, PaymentMethod, Prisma } from "@prisma/client";

import { addMonths } from "./date.ts";
import { getPrisma } from "./prisma.ts";

const allowedProofTypes = new Map([
  ["image/png", { extension: "png", mimeType: "image/png" }],
  ["image/jpeg", { extension: "jpg", mimeType: "image/jpeg" }],
  ["image/webp", { extension: "webp", mimeType: "image/webp" }],
  ["application/pdf", { extension: "pdf", mimeType: "application/pdf" }],
]);

const allowedProofExtensions = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
]);

const maxProofBytes = 5 * 1024 * 1024;
export const PAYMENT_PROOFS_PUBLIC_DIR = path.join(
  process.cwd(),
  "public",
  "payment-proofs",
);

export type ManualPaymentOption = {
  id: string;
  type: "PLAN" | "CREDIT_PACKAGE";
  name: string;
  amount: string;
  currency: string;
  reportCredits: number;
  planId?: string;
  planSlug?: string;
  whiteLabelEnabled?: boolean;
  manualReviewEnabled?: boolean;
};

export type ManualPaymentMethod = {
  id: string;
  label: string;
  accountTitle?: string;
  accountNumber?: string;
  serviceName?: string;
  instructions?: string;
  requiredReferenceNote?: string;
  configured: boolean;
};

export function getManualPaymentMethods(): ManualPaymentMethod[] {
  const methods = [
    {
      id: "BANK_TRANSFER",
      label: "Bank Transfer",
      accountTitle: process.env.MANUAL_PAYMENT_BANK_TITLE,
      accountNumber: process.env.MANUAL_PAYMENT_BANK_IBAN,
      serviceName: process.env.MANUAL_PAYMENT_BANK_NAME,
      instructions: "Send the selected amount and include your invoice/package name in the transfer note.",
      requiredReferenceNote: "Use your account email or transaction reference in the note.",
    },
    {
      id: "EASYPAISA",
      label: "EasyPaisa",
      accountTitle: process.env.MANUAL_PAYMENT_EASYPAISA_TITLE,
      accountNumber: process.env.MANUAL_PAYMENT_EASYPAISA_NUMBER,
      serviceName: "EasyPaisa",
      instructions: "Send the selected amount to the listed wallet number.",
      requiredReferenceNote: "Enter the EasyPaisa transaction ID before submitting proof.",
    },
    {
      id: "JAZZCASH",
      label: "JazzCash",
      accountTitle: process.env.MANUAL_PAYMENT_JAZZCASH_TITLE,
      accountNumber: process.env.MANUAL_PAYMENT_JAZZCASH_NUMBER,
      serviceName: "JazzCash",
      instructions: "Send the selected amount to the listed wallet number.",
      requiredReferenceNote: "Enter the JazzCash transaction ID before submitting proof.",
    },
    {
      id: "MANUAL",
      label: "Wise / International Transfer",
      accountTitle: process.env.MANUAL_PAYMENT_WISE_TITLE,
      accountNumber: process.env.MANUAL_PAYMENT_WISE_ACCOUNT,
      serviceName: process.env.MANUAL_PAYMENT_WISE_NAME ?? "Wise",
      instructions: "Contact support for international transfer confirmation before submitting proof.",
      requiredReferenceNote: "Enter the transfer reference from your provider.",
    },
  ];

  return methods
    .map((method) => ({
      ...method,
      accountTitle: method.accountTitle?.trim(),
      accountNumber: method.accountNumber?.trim(),
      serviceName: method.serviceName?.trim(),
      configured: Boolean(method.accountTitle?.trim() && method.accountNumber?.trim()),
    }))
    .filter((method) => method.configured);
}

export function getConfiguredManualPaymentMethodIds() {
  return new Set(
    getManualPaymentMethods()
      .filter((method) => method.configured)
      .map((method) => method.id),
  );
}

export async function getManualPaymentOptions(): Promise<ManualPaymentOption[]> {
  const prisma = getPrisma();
  const [plans, creditPackages] = await Promise.all([
    prisma.plan.findMany({
      where: {
        isActive: true,
        billingType: {
          not: "FREE",
        },
      },
      orderBy: [
        { price: "asc" },
        { name: "asc" },
      ],
    }),
    prisma.creditPackage.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { price: "asc" },
        { name: "asc" },
      ],
    }),
  ]);

  return [
    ...plans.map((plan) => ({
      id: `plan:${plan.slug}`,
      type: "PLAN" as const,
      name: plan.name,
      amount: plan.price.toString(),
      currency: plan.currency,
      reportCredits: plan.reportCredits,
      planId: plan.id,
      planSlug: plan.slug,
      whiteLabelEnabled: plan.whiteLabelEnabled,
      manualReviewEnabled: plan.manualReviewEnabled,
    })),
    ...creditPackages.map((pkg) => ({
      id: `credits:${pkg.slug}`,
      type: "CREDIT_PACKAGE" as const,
      name: pkg.name,
      amount: pkg.price.toString(),
      currency: pkg.currency,
      reportCredits: pkg.reportCredits,
    })),
  ];
}

export async function resolveManualPaymentOption(optionId: string) {
  const options = await getManualPaymentOptions();

  return options.find((option) => option.id === optionId) ?? null;
}

function isSafeUserId(userId: string) {
  return /^[a-zA-Z0-9_-]+$/.test(userId);
}

export function isPathInsidePaymentProofs(filePath: string) {
  const assetsDir = path.resolve(PAYMENT_PROOFS_PUBLIC_DIR);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(assetsDir, resolvedPath);

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function validateProofFile(file: File | null) {
  if (!file) {
    return { error: "Payment proof file is required.", success: false as const };
  }

  const allowedType = allowedProofTypes.get(file.type);

  if (!allowedType) {
    return {
      error: "Proof must be a PNG, JPG, JPEG, WebP, or PDF file.",
      success: false as const,
    };
  }

  if (file.size > maxProofBytes) {
    return {
      error: "Proof must be 5 MB or smaller.",
      success: false as const,
    };
  }

  return { ...allowedType, success: true as const };
}

export async function savePaymentProof(userId: string, file: File | null) {
  if (!isSafeUserId(userId)) {
    return { error: "Invalid user identifier.", status: 400, success: false as const };
  }

  if (!file) {
    return { error: "Payment proof file is required.", status: 400, success: false as const };
  }

  const validation = validateProofFile(file);

  if (!validation.success) {
    return { error: validation.error, status: 400, success: false as const };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.byteLength > maxProofBytes) {
    return { error: "Proof must be 5 MB or smaller.", status: 400, success: false as const };
  }

  const userDir = path.join(PAYMENT_PROOFS_PUBLIC_DIR, userId);
  const fileName = `proof-${Date.now()}.${validation.extension}`;
  const proofPath = path.join(userDir, fileName);

  if (!isPathInsidePaymentProofs(proofPath)) {
    return { error: "Proof path is invalid.", status: 400, success: false as const };
  }

  await mkdir(userDir, { recursive: true });
  await writeFile(proofPath, buffer, { flag: "wx" });
  await stat(proofPath);

  return {
    proofPath,
    proofUrl: `/api/billing/payment-proof/${fileName}`,
    success: true as const,
  };
}

export async function readPaymentProof(proofPath: string | null) {
  if (!proofPath || !isPathInsidePaymentProofs(proofPath)) {
    return null;
  }

  const extension = path.extname(proofPath).toLowerCase();
  const mimeType = allowedProofExtensions.get(extension);

  if (!mimeType) {
    return null;
  }

  try {
    const fileStats = await stat(proofPath);

    if (!fileStats.isFile() || fileStats.size <= 0 || fileStats.size > maxProofBytes) {
      return null;
    }

    const bytes = await readFile(proofPath);

    if (bytes.byteLength <= 0 || bytes.byteLength > maxProofBytes) {
      return null;
    }

    return { bytes, mimeType };
  } catch {
    return null;
  }
}

export async function deletePaymentProof(proofPath: string | null) {
  if (!proofPath || !isPathInsidePaymentProofs(proofPath)) {
    return;
  }

  await unlink(proofPath).catch(() => undefined);
}

export async function createManualPaymentRequest(input: {
  userId: string;
  optionId: string;
  paymentMethod: string;
  transactionReference?: string;
  payerName?: string;
  payerPhone?: string;
  proofPath: string;
}) {
  const option = await resolveManualPaymentOption(input.optionId);

  if (!option) {
    throw new Error("Select a valid plan or credit package.");
  }

  const configuredMethodIds = getConfiguredManualPaymentMethodIds();

  if (!configuredMethodIds.has(input.paymentMethod)) {
    throw new Error("Select a configured manual payment method.");
  }

  const prisma = getPrisma();
  const duplicatePending = await prisma.manualPaymentRequest.findFirst({
    where: {
      userId: input.userId,
      status: "PENDING",
      planId: option.planId ?? null,
      packageName: option.name,
    },
  });

  if (duplicatePending) {
    throw new Error("A pending request already exists for this plan or package.");
  }

  const request = await prisma.manualPaymentRequest.create({
    data: {
      userId: input.userId,
      planId: option.planId,
      packageName: option.name,
      amount: option.amount,
      currency: option.currency,
      reportCredits: option.reportCredits,
      requestedPlanName: option.type === "PLAN" ? option.name : null,
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference || null,
      payerName: input.payerName || null,
      payerPhone: input.payerPhone || null,
      proofPath: input.proofPath,
      status: "PENDING",
    },
  });

  return prisma.manualPaymentRequest.update({
    where: { id: request.id },
    data: {
      proofUrl: `/api/billing/payment-proof/request/${request.id}`,
    },
  });
}

export async function findPendingManualPaymentRequestForOption(
  userId: string,
  optionId: string,
) {
  const option = await resolveManualPaymentOption(optionId);

  if (!option) {
    return null;
  }

  const prisma = getPrisma();

  return prisma.manualPaymentRequest.findFirst({
    where: {
      packageName: option.name,
      planId: option.planId ?? null,
      status: "PENDING",
      userId,
    },
    select: {
      id: true,
    },
  });
}

export async function cancelManualPaymentRequest(userId: string, requestId: string) {
  const prisma = getPrisma();
  const result = await prisma.manualPaymentRequest.updateMany({
    where: {
      id: requestId,
      userId,
      status: "PENDING",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (result.count === 0) {
    throw new Error("Only pending payment requests can be cancelled.");
  }

  await prisma.adminAuditLog.create({
    data: {
      adminUserId: userId,
      action: "PAYMENT_CANCELLED_BY_USER",
      targetUserId: userId,
      targetType: "ManualPaymentRequest",
      targetId: requestId,
    },
  }).catch(() => undefined);
}

function normalizePaymentMethod(method: string): PaymentMethod {
  if (method === "BANK_TRANSFER" || method === "JAZZCASH" || method === "EASYPAISA") {
    return method;
  }

  return "MANUAL";
}

export async function approveManualPaymentRequest(adminUserId: string, requestId: string) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const request = await tx.manualPaymentRequest.findUnique({
      where: { id: requestId },
      include: { plan: true },
    });

    if (!request) {
      throw new Error("Payment request not found.");
    }

    if (request.status === "APPROVED") {
      return { alreadyApproved: true, request };
    }

    if (request.status !== "PENDING") {
      throw new Error("Only pending payment requests can be approved.");
    }

    const now = new Date();
    const updatedRequest = await tx.manualPaymentRequest.update({
      where: {
        id: request.id,
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        reviewedByAdminId: adminUserId,
        reviewedAt: now,
      },
    });

    if (request.planId && request.plan) {
      await tx.subscription.updateMany({
        where: {
          userId: request.userId,
          status: "ACTIVE",
        },
        data: {
          status: "INACTIVE",
        },
      });

      await tx.subscription.create({
        data: {
          userId: request.userId,
          planId: request.planId,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: addMonths(now, 1),
          creditsTotal: request.reportCredits,
          creditsUsed: 0,
          creditsRemaining: request.reportCredits,
        },
      });

      await tx.payment.create({
        data: {
          userId: request.userId,
          planId: request.planId,
          amount: request.amount,
          currency: request.currency,
          provider: "MANUAL",
          method: normalizePaymentMethod(request.paymentMethod),
          status: "APPROVED",
          packageName: request.packageName,
          reportCredits: request.reportCredits,
          proofUrl: `/api/billing/payment-proof/request/${request.id}`,
          transactionRef: request.transactionReference,
        },
      });
    } else if (request.reportCredits > 0) {
      const activeSubscription = await tx.subscription.findFirst({
        where: {
          userId: request.userId,
          status: "ACTIVE",
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      if (!activeSubscription) {
        throw new Error("User must have an active subscription before credits can be added.");
      }

      await tx.subscription.update({
        where: { id: activeSubscription.id },
        data: {
          creditsTotal: { increment: request.reportCredits },
          creditsRemaining: { increment: request.reportCredits },
        },
      });

      await tx.payment.create({
        data: {
          userId: request.userId,
          amount: request.amount,
          currency: request.currency,
          provider: "MANUAL",
          method: normalizePaymentMethod(request.paymentMethod),
          status: "APPROVED",
          packageName: request.packageName,
          reportCredits: request.reportCredits,
          proofUrl: `/api/billing/payment-proof/request/${request.id}`,
          transactionRef: request.transactionReference,
        },
      });
    }

    await tx.adminAuditLog.createMany({
      data: [
        {
          adminUserId,
          action: "PAYMENT_APPROVED",
          targetUserId: request.userId,
          targetType: "ManualPaymentRequest",
          targetId: request.id,
          metadata: {
            amount: request.amount.toString(),
            currency: request.currency,
            packageName: request.packageName,
          } as Prisma.InputJsonValue,
        },
        {
          adminUserId,
          action: request.planId ? "PLAN_ACTIVATED" : "CREDITS_ADDED",
          targetUserId: request.userId,
          targetType: request.planId ? "Subscription" : "SubscriptionCredits",
          targetId: request.id,
          metadata: {
            reportCredits: request.reportCredits,
            planId: request.planId,
          } as Prisma.InputJsonValue,
        },
      ],
    });

    return { alreadyApproved: false, request: updatedRequest };
  });
}

export async function rejectManualPaymentRequest(
  adminUserId: string,
  requestId: string,
  adminNote: string,
) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const request = await tx.manualPaymentRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error("Payment request not found.");
    }

    if (request.status !== "PENDING") {
      throw new Error("Only pending payment requests can be rejected.");
    }

    const updatedRequest = await tx.manualPaymentRequest.update({
      where: {
        id: requestId,
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        adminNote,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
      },
    });

    await tx.adminAuditLog.create({
      data: {
        adminUserId,
        action: "PAYMENT_REJECTED",
        targetUserId: request.userId,
        targetType: "ManualPaymentRequest",
        targetId: request.id,
        reason: adminNote,
        metadata: {
          amount: request.amount.toString(),
          currency: request.currency,
          packageName: request.packageName,
        } as Prisma.InputJsonValue,
      },
    });

    return updatedRequest;
  });
}

export function statusBadgeVariant(status: ManualPaymentRequestStatus) {
  if (status === "APPROVED") {
    return "success" as const;
  }

  if (status === "REJECTED") {
    return "destructive" as const;
  }

  if (status === "CANCELLED") {
    return "outline" as const;
  }

  return "warning" as const;
}
