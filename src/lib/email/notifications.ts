import {
  getAppUrl,
  getEmailConfig,
  isValidEmailAddress,
} from "./emailConfig.ts";
import { emailTemplates } from "./emailTemplates.ts";
import { sendEmail } from "./sendEmail.ts";
import { getPrisma } from "../prisma.ts";
import { createInAppNotification } from "../notifications/notifications.ts";

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function sanitizeErrorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : "PDF generation failed.";

  return message
    .replace(/[A-Z]:\\[^\s]+/g, "[path redacted]")
    .replace(/\/(?:[^/\s]+\/){2,}[^/\s]+/g, "[path redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 240);
}

async function safeNotify(name: string, callback: () => Promise<void>) {
  try {
    await callback();
  } catch (error) {
    console.warn("[email] notification failed", {
      error: sanitizeErrorSummary(error),
      notification: name,
    });
  }
}

async function safeCreateInAppNotification(
  name: string,
  input: Parameters<typeof createInAppNotification>[0],
) {
  try {
    await createInAppNotification(input);
  } catch (error) {
    console.warn("[notifications] in-app creation failed", {
      error: sanitizeErrorSummary(error),
      notification: name,
    });
  }
}

async function sendAdminEmail(input: {
  templateKey: string;
  template: ReturnType<(typeof emailTemplates)["manualPaymentSubmittedAdmin"]>;
  dedupeKey?: string;
}) {
  const config = getEmailConfig();
  const adminEmail = config.adminNotificationEmail;

  if (!isValidEmailAddress(adminEmail)) {
    return;
  }

  await sendEmail({
    dedupeKey: input.dedupeKey,
    template: input.template,
    templateKey: input.templateKey,
    to: adminEmail,
  });
}

export async function notifyManualPaymentSubmitted(requestId: string) {
  await safeNotify("manual-payment-submitted", async () => {
    const prisma = getPrisma();
    const request = await prisma.manualPaymentRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true,
          },
        },
      },
    });

    if (!request || request.status !== "PENDING") {
      return;
    }

    await sendEmail({
      dedupeKey: `manual-payment.submitted.user:${request.id}`,
      preferenceKey: "paymentEmails",
      template: emailTemplates.manualPaymentSubmittedUser({
        amount: request.amount.toString(),
        billingUrl: getAppUrl("/dashboard/billing"),
        currency: request.currency,
        packageName: request.packageName,
      }),
      templateKey: "manual-payment.submitted.user",
      to: request.user.email,
      userId: request.user.id,
    });
    await safeCreateInAppNotification("manual-payment-submitted", {
      href: "/dashboard/billing",
      message: "Your payment request is pending admin review.",
      metadata: {
        eventKey: `manual-payment.submitted:${request.id}`,
        requestId: request.id,
      },
      title: "Payment request submitted",
      type: "manual_payment_submitted",
      userId: request.user.id,
    });

    await sendAdminEmail({
      dedupeKey: `manual-payment.submitted.admin:${request.id}`,
      template: emailTemplates.manualPaymentSubmittedAdmin({
        adminUrl: getAppUrl("/dashboard/admin/payments"),
        amount: request.amount.toString(),
        currency: request.currency,
        packageName: request.packageName,
        paymentMethod: request.paymentMethod,
        transactionReference: request.transactionReference,
        userEmail: request.user.email,
        userName: request.user.name,
      }),
      templateKey: "manual-payment.submitted.admin",
    });
  });
}

export async function notifyManualPaymentApproved(requestId: string) {
  await safeNotify("manual-payment-approved", async () => {
    const prisma = getPrisma();
    const request = await prisma.manualPaymentRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!request || request.status !== "APPROVED") {
      return;
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        status: "ACTIVE",
        userId: request.userId,
      },
      include: {
        plan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    await sendEmail({
      dedupeKey: `manual-payment.approved:${request.id}`,
      preferenceKey: "paymentEmails",
      template: emailTemplates.manualPaymentApprovedUser({
        billingUrl: getAppUrl("/dashboard/billing"),
        currentCredits: activeSubscription?.creditsRemaining ?? null,
        currentPlan: activeSubscription?.plan.name ?? null,
        packageName: request.packageName,
        reportCredits: request.reportCredits,
      }),
      templateKey: "manual-payment.approved.user",
      to: request.user.email,
      userId: request.user.id,
    });
    await safeCreateInAppNotification("manual-payment-approved", {
      href: "/dashboard/billing",
      message: "Your plan or credits have been activated.",
      metadata: {
        eventKey: `manual-payment.approved:${request.id}`,
        requestId: request.id,
      },
      title: "Payment approved",
      type: "manual_payment_approved",
      userId: request.user.id,
    });
  });
}

export async function notifyManualPaymentRejected(requestId: string) {
  await safeNotify("manual-payment-rejected", async () => {
    const prisma = getPrisma();
    const request = await prisma.manualPaymentRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!request || request.status !== "REJECTED") {
      return;
    }

    await sendEmail({
      dedupeKey: `manual-payment.rejected:${request.id}`,
      preferenceKey: "paymentEmails",
      template: emailTemplates.manualPaymentRejectedUser({
        adminNote: request.adminNote,
        billingUrl: getAppUrl("/dashboard/billing"),
        packageName: request.packageName,
      }),
      templateKey: "manual-payment.rejected.user",
      to: request.user.email,
      userId: request.user.id,
    });
    await safeCreateInAppNotification("manual-payment-rejected", {
      href: "/dashboard/billing",
      message: "Your payment request was rejected. Check billing for details.",
      metadata: {
        eventKey: `manual-payment.rejected:${request.id}`,
        requestId: request.id,
      },
      title: "Payment rejected",
      type: "manual_payment_rejected",
      userId: request.user.id,
    });
  });
}

export async function notifyScanCompleted(scanId: string) {
  await safeNotify("scan-completed", async () => {
    const prisma = getPrisma();
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        _count: {
          select: {
            findings: true,
          },
        },
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!scan || scan.status !== "COMPLETED") {
      return;
    }

    await sendEmail({
      dedupeKey: `scan.completed:${scan.id}`,
      preferenceKey: "scanEmails",
      template: emailTemplates.scanCompletedUser({
        domain: scan.rootDomain,
        findingsCount: scan._count.findings,
        grade: scan.grade,
        scanUrl: getAppUrl(`/dashboard/scans/${scan.id}`),
        score: scan.score,
      }),
      templateKey: "scan.completed.user",
      to: scan.user.email,
      userId: scan.user.id,
    });
    await safeCreateInAppNotification("scan-completed", {
      href: `/dashboard/scans/${scan.id}`,
      message: "Your website scan is complete.",
      metadata: {
        eventKey: `scan.completed:${scan.id}`,
        scanId: scan.id,
      },
      title: "Scan completed",
      type: "scan_completed",
      userId: scan.user.id,
    });
  });
}

export async function notifyPdfReportGenerated(reportId: string) {
  await safeNotify("pdf-report-generated", async () => {
    const prisma = getPrisma();
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        scan: {
          select: {
            grade: true,
            rootDomain: true,
            score: true,
          },
        },
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!report || report.status !== "GENERATED") {
      return;
    }
    const isBasicReport = report.reportType === "BASIC";

    await sendEmail({
      dedupeKey: `pdf.generated:${report.id}`,
      preferenceKey: "reportEmails",
      template: emailTemplates.pdfReportGeneratedUser({
        domain: report.scan.rootDomain,
        grade: report.scan.grade,
        reportUrl: getAppUrl("/dashboard/reports"),
        score: report.scan.score,
      }),
      templateKey: "pdf.generated.user",
      to: report.user.email,
      userId: report.user.id,
    });
    await safeCreateInAppNotification("pdf-report-generated", {
      href: `/dashboard/scans/${report.scanId}`,
      message: isBasicReport
        ? "Your basic PDF report is ready to download."
        : "Your PDF report is ready to download.",
      metadata: {
        eventKey: `pdf.generated:${report.id}`,
        reportId: report.id,
        scanId: report.scanId,
      },
      title: isBasicReport ? "Basic PDF report ready" : "PDF report ready",
      type: "pdf_report_ready",
      userId: report.user.id,
    });
  });
}

export async function notifyPdfGenerationFailed(input: {
  scanId: string;
  userId: string;
  error: unknown;
}) {
  await safeNotify("pdf-generation-failed", async () => {
    const prisma = getPrisma();
    const scan = await prisma.scan.findFirst({
      where: {
        id: input.scanId,
        userId: input.userId,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!scan) {
      return;
    }

    await sendAdminEmail({
      dedupeKey: `pdf.failed:${scan.id}`,
      template: emailTemplates.pdfGenerationFailedAdmin({
        adminUrl: getAppUrl("/dashboard/admin/jobs"),
        errorSummary: sanitizeErrorSummary(input.error),
        scanTarget: scan.rootDomain || scan.targetUrl,
        userEmail: scan.user.email,
      }),
      templateKey: "pdf.failed.admin",
    });
  });
}

export async function notifyReportShareCreated(shareId: string) {
  await safeNotify("report-share-created", async () => {
    const prisma = getPrisma();
    const share = await prisma.reportShare.findUnique({
      where: { id: shareId },
      include: {
        client: {
          select: {
            companyName: true,
            name: true,
          },
        },
        report: {
          include: {
            scan: {
              select: {
                rootDomain: true,
              },
            },
          },
        },
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!share || !share.isActive) {
      return;
    }

    await sendEmail({
      dedupeKey: `report-share.created:${share.id}`,
      preferenceKey: "shareEmails",
      template: emailTemplates.reportShareCreatedUser({
        clientName: share.client?.companyName ?? share.client?.name ?? null,
        domain: share.report.scan.rootDomain,
        expiresAt: formatDate(share.expiresAt),
        managementUrl: getAppUrl("/dashboard/reports"),
        title: share.title ?? `Security report for ${share.report.scan.rootDomain}`,
      }),
      templateKey: "report-share.created.user",
      to: share.user.email,
      userId: share.user.id,
    });
    await safeCreateInAppNotification("report-share-created", {
      href: "/dashboard/reports",
      message: "A secure share link was created for your report.",
      metadata: {
        eventKey: `report-share.created:${share.id}`,
        shareId: share.id,
      },
      title: "Report share link created",
      type: "share_link_created",
      userId: share.user.id,
    });
  });
}

export async function notifyPaymentActivated(paymentId: string) {
  await safeNotify("payment-activated", async () => {
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        creditPackage: {
          select: {
            name: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!payment || payment.status !== "APPROVED") {
      return;
    }

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        status: "ACTIVE",
        userId: payment.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        currentPeriodEnd: true,
        creditsRemaining: true,
      },
    });
    const packageName =
      payment.packageName ?? payment.plan?.name ?? payment.creditPackage?.name ?? "Payment";

    if (payment.planId) {
      await sendEmail({
        dedupeKey: `payment.activated:${payment.id}`,
        preferenceKey: "paymentEmails",
        template: emailTemplates.subscriptionActivatedUser({
          billingUrl: getAppUrl("/dashboard/billing"),
          credits: payment.reportCredits,
          periodEnd: formatDate(activeSubscription?.currentPeriodEnd),
          planName: packageName,
        }),
        templateKey: "payment.activated.user",
        to: payment.user.email,
        userId: payment.user.id,
      });
      await safeCreateInAppNotification("payment-activated-plan", {
        href: "/dashboard/billing",
        message: "Your subscription is now active.",
        metadata: {
          eventKey: `payment.activated:${payment.id}`,
          paymentId: payment.id,
        },
        title: "Subscription activated",
        type: "subscription_activated",
        userId: payment.user.id,
      });
      return;
    }

    await sendEmail({
      dedupeKey: `payment.activated:${payment.id}`,
      preferenceKey: "paymentEmails",
      template: emailTemplates.manualPaymentApprovedUser({
        billingUrl: getAppUrl("/dashboard/billing"),
        currentCredits: activeSubscription?.creditsRemaining ?? null,
        currentPlan: null,
        packageName,
        reportCredits: payment.reportCredits,
      }),
      templateKey: "payment.activated.user",
      to: payment.user.email,
      userId: payment.user.id,
    });
    await safeCreateInAppNotification("payment-activated-credits", {
      href: "/dashboard/billing",
      message: "Your plan or credits have been activated.",
      metadata: {
        eventKey: `payment.activated:${payment.id}`,
        paymentId: payment.id,
      },
      title: "Payment approved",
      type: "manual_payment_approved",
      userId: payment.user.id,
    });
  });
}

export async function notifyPaymentFailed(paymentId: string) {
  await safeNotify("payment-failed", async () => {
    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        creditPackage: {
          select: {
            name: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
        user: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    if (!payment || payment.status !== "FAILED") {
      return;
    }

    await sendEmail({
      dedupeKey: `payment.failed:${payment.id}`,
      preferenceKey: "paymentEmails",
      template: emailTemplates.paymentFailedUser({
        billingUrl: getAppUrl("/dashboard/billing"),
        packageName:
          payment.packageName ?? payment.plan?.name ?? payment.creditPackage?.name ?? null,
        provider: payment.provider,
      }),
      templateKey: "payment.failed.user",
      to: payment.user.email,
      userId: payment.user.id,
    });
    await safeCreateInAppNotification("payment-failed", {
      href: "/dashboard/billing",
      message: "Your payment failed. No credits or plan access were added.",
      metadata: {
        eventKey: `payment.failed:${payment.id}`,
        paymentId: payment.id,
      },
      title: "Payment failed",
      type: "payment_failed",
      userId: payment.user.id,
    });
  });
}
