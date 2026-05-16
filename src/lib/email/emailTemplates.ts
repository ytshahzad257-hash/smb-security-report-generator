import { getAppUrl } from "./emailConfig.ts";
import { siteConfig } from "../site.ts";

export type EmailTemplate = {
  html: string;
  subject: string;
  text: string;
};

type Row = {
  label: string;
  value: string | null | undefined;
};

const reportDisclaimer =
  "Security reports use automated safe checks only. They are not penetration tests, security certifications, or guarantees that a website is secure.";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compactRows(rows: Row[]) {
  return rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
}

function renderText(input: {
  title: string;
  intro: string;
  rows?: Row[];
  actionLabel?: string;
  actionUrl?: string;
  note?: string;
}) {
  const rows = compactRows(input.rows ?? []);

  return [
    siteConfig.name,
    "",
    input.title,
    "",
    input.intro,
    rows.length > 0 ? "" : null,
    ...rows.map((row) => `${row.label}: ${row.value}`),
    input.actionUrl ? "" : null,
    input.actionUrl ? `${input.actionLabel ?? "Open"}: ${input.actionUrl}` : null,
    input.note ? "" : null,
    input.note ?? null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function renderHtml(input: {
  title: string;
  intro: string;
  rows?: Row[];
  actionLabel?: string;
  actionUrl?: string;
  note?: string;
}) {
  const rows = compactRows(input.rows ?? []);
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;line-height:1.5;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(siteConfig.name)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:#0f172a;">${escapeHtml(input.title)}</h1>
                <p style="margin:0 0 18px;font-size:14px;color:#334155;">${escapeHtml(input.intro)}</p>
                ${
                  rows.length > 0
                    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 20px;">
                  ${rows
                    .map(
                      (row) => `<tr>
                    <td style="width:38%;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#64748b;">${escapeHtml(row.label)}</td>
                    <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;word-break:break-word;">${escapeHtml(String(row.value))}</td>
                  </tr>`,
                    )
                    .join("")}
                </table>`
                    : ""
                }
                ${
                  input.actionUrl
                    ? `<p style="margin:0 0 18px;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;border-radius:6px;background:#0f172a;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:10px 14px;">${escapeHtml(input.actionLabel ?? "Open")}</a></p>`
                    : ""
                }
                ${
                  input.note
                    ? `<p style="margin:0;padding:12px;border-radius:6px;background:#f1f5f9;font-size:12px;color:#475569;">${escapeHtml(input.note)}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                ${supportEmail ? `Need help? Contact ${escapeHtml(supportEmail)}.` : "You are receiving this transactional notification for your account."}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function template(input: {
  subject: string;
  title: string;
  intro: string;
  rows?: Row[];
  actionLabel?: string;
  actionUrl?: string;
  note?: string;
}): EmailTemplate {
  return {
    html: renderHtml(input),
    subject: input.subject,
    text: renderText(input),
  };
}

function formatCredits(credits: number | null | undefined) {
  if (credits === null || credits === undefined) {
    return null;
  }

  return `${credits} report credit${credits === 1 ? "" : "s"}`;
}

export const emailTemplates = {
  adminTestEmail(input: {
    adminEmail: string;
    provider: string;
    logsUrl?: string;
  }) {
    return template({
      subject: "Test email notification",
      title: "Test email notification",
      intro: "This is a development/admin test for transactional email delivery.",
      rows: [
        { label: "Requested by", value: input.adminEmail },
        { label: "Provider", value: input.provider },
      ],
      actionLabel: "View email logs",
      actionUrl: input.logsUrl ?? getAppUrl("/dashboard/admin/emails"),
      note: "This test does not activate plans, credits, payments, scans, reports, or share links.",
    });
  },

  manualPaymentSubmittedUser(input: {
    packageName: string;
    amount: string;
    currency: string;
    billingUrl?: string;
  }) {
    return template({
      subject: "Payment request submitted",
      title: "Payment request submitted",
      intro:
        "Your payment request is pending admin review. Your credits or plan are not active yet.",
      rows: [
        { label: "Request", value: input.packageName },
        { label: "Amount", value: `${input.amount} ${input.currency}` },
        { label: "Review note", value: "Most requests are reviewed after proof is checked." },
      ],
      actionLabel: "Open billing",
      actionUrl: input.billingUrl ?? getAppUrl("/dashboard/billing"),
    });
  },

  manualPaymentSubmittedAdmin(input: {
    userName: string | null;
    userEmail: string;
    packageName: string;
    amount: string;
    currency: string;
    paymentMethod: string;
    transactionReference: string | null;
    adminUrl?: string;
  }) {
    return template({
      subject: "New manual payment request",
      title: "New manual payment request",
      intro: "A user submitted payment proof for admin review.",
      rows: [
        { label: "User", value: input.userName ? `${input.userName} (${input.userEmail})` : input.userEmail },
        { label: "Selected plan/package", value: input.packageName },
        { label: "Amount", value: `${input.amount} ${input.currency}` },
        { label: "Payment method", value: input.paymentMethod },
        { label: "Transaction reference", value: input.transactionReference },
      ],
      actionLabel: "Review payments",
      actionUrl: input.adminUrl ?? getAppUrl("/dashboard/admin/payments"),
      note: "Payment proof is not attached. Review it only through the safe admin payment route.",
    });
  },

  manualPaymentApprovedUser(input: {
    packageName: string;
    reportCredits: number;
    currentPlan: string | null;
    currentCredits: number | null;
    billingUrl?: string;
  }) {
    return template({
      subject: "Payment approved",
      title: "Payment approved",
      intro: "Your payment has been approved and the eligible plan or credits are now active.",
      rows: [
        { label: "Approved item", value: input.packageName },
        { label: "Credits added", value: formatCredits(input.reportCredits) },
        { label: "Current plan", value: input.currentPlan },
        { label: "Current credits", value: formatCredits(input.currentCredits) },
      ],
      actionLabel: "Open billing",
      actionUrl: input.billingUrl ?? getAppUrl("/dashboard/billing"),
    });
  },

  manualPaymentRejectedUser(input: {
    packageName: string;
    adminNote: string | null;
    billingUrl?: string;
  }) {
    return template({
      subject: "Payment request rejected",
      title: "Payment request rejected",
      intro: "Your payment request was rejected. No credits or plan access were added.",
      rows: [
        { label: "Request", value: input.packageName },
        { label: "Reason", value: input.adminNote },
      ],
      actionLabel: "Open billing",
      actionUrl: input.billingUrl ?? getAppUrl("/dashboard/billing"),
    });
  },

  scanCompletedUser(input: {
    domain: string;
    score: number | null;
    grade: string | null;
    findingsCount: number;
    scanUrl?: string;
  }) {
    return template({
      subject: "Website scan completed",
      title: "Website scan completed",
      intro: "Your automated website posture scan has completed.",
      rows: [
        { label: "Target domain", value: input.domain },
        { label: "Score", value: input.score === null ? null : `${input.score}/100` },
        { label: "Grade", value: input.grade },
        { label: "Findings", value: String(input.findingsCount) },
      ],
      actionLabel: "View scan",
      actionUrl: input.scanUrl ?? getAppUrl("/dashboard/scans"),
      note: reportDisclaimer,
    });
  },

  pdfReportGeneratedUser(input: {
    domain: string;
    score: number | null;
    grade: string | null;
    reportUrl?: string;
  }) {
    return template({
      subject: "PDF report ready",
      title: "PDF report ready",
      intro: "Your PDF report is ready to view or download from your dashboard.",
      rows: [
        { label: "Target domain", value: input.domain },
        { label: "Score", value: input.score === null ? null : `${input.score}/100` },
        { label: "Grade", value: input.grade },
      ],
      actionLabel: "Open report",
      actionUrl: input.reportUrl ?? getAppUrl("/dashboard/reports"),
      note: reportDisclaimer,
    });
  },

  reportShareCreatedUser(input: {
    title: string;
    domain: string;
    expiresAt: string | null;
    clientName: string | null;
    managementUrl?: string;
  }) {
    return template({
      subject: "Report share link created",
      title: "Report share link created",
      intro: "A secure report share link was created. Manage access from your reports area.",
      rows: [
        { label: "Report", value: input.title },
        { label: "Domain", value: input.domain },
        { label: "Expiration", value: input.expiresAt ?? "No expiration set" },
        { label: "Client", value: input.clientName },
      ],
      actionLabel: "Manage share links",
      actionUrl: input.managementUrl ?? getAppUrl("/dashboard/reports"),
      note: "Passwords are never included in email. Active, revoked, expired, and password-protected share rules still apply.",
    });
  },

  paymentFailedUser(input: {
    provider: string;
    packageName: string | null;
    billingUrl?: string;
  }) {
    return template({
      subject: "Payment failed",
      title: "Payment failed",
      intro: "A verified payment provider reported that your payment failed. No credits or plan access were added.",
      rows: [
        { label: "Provider", value: input.provider },
        { label: "Item", value: input.packageName },
      ],
      actionLabel: "Open billing",
      actionUrl: input.billingUrl ?? getAppUrl("/dashboard/billing"),
    });
  },

  subscriptionActivatedUser(input: {
    planName: string;
    credits: number;
    periodEnd: string | null;
    billingUrl?: string;
  }) {
    return template({
      subject: "Subscription activated",
      title: "Subscription activated",
      intro: "Your verified payment is complete and your plan or credits are active.",
      rows: [
        { label: "Plan/package", value: input.planName },
        { label: "Credits", value: formatCredits(input.credits) },
        { label: "Period end", value: input.periodEnd },
      ],
      actionLabel: "Open billing",
      actionUrl: input.billingUrl ?? getAppUrl("/dashboard/billing"),
    });
  },

  pdfGenerationFailedAdmin(input: {
    userEmail: string;
    scanTarget: string;
    errorSummary: string;
    adminUrl?: string;
  }) {
    return template({
      subject: "PDF generation failed",
      title: "PDF generation failed",
      intro: "A PDF generation job failed after the app attempted to create a report.",
      rows: [
        { label: "User", value: input.userEmail },
        { label: "Scan target", value: input.scanTarget },
        { label: "Error summary", value: input.errorSummary },
      ],
      actionLabel: "Open report jobs",
      actionUrl: input.adminUrl ?? getAppUrl("/dashboard/admin/jobs"),
      note: "Stack traces, raw file paths, and internal payloads are intentionally omitted.",
    });
  },
};
