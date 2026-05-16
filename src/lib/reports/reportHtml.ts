import {
  HTTP_SECURITY_HEADER_NAMES,
  type HeaderCheckStatus,
} from "../scanners/httpHeadersScanner.ts";
import { remediationGroups, type ReportData, type ReportFinding } from "./reportData.ts";
import { severityOrder, type FindingSeverity } from "../security/scoringEngine.ts";
import { isValidHexColor } from "../agency/agencyValidation.ts";

const disclaimer =
  "This report is based on automated safe checks only. It is not a penetration test, security certification, or full OWASP compliance audit.";
const dkimNote =
  "DKIM common selector checks are limited. A domain may use a provider-specific selector.";
const forbiddenGeneratedClaims = [
  "Website is secure",
  "OWASP compliant",
  "Passed OWASP",
  "Security certified",
  "Pentest score",
  "No vulnerabilities found",
];

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type ReportBranding = {
  agencyName: string;
  agencyLogoDataUri: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  address: string | null;
  footerText: string;
  showPoweredBy: boolean;
};

function formatDate(date: Date | string | null) {
  if (!date) {
    return "-";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(date);
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function formatMaybeDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return formatDate(value);
}

function sentence(value: unknown) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : "-";
}

function badge(value: string, tone = "neutral") {
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function severityTone(severity: FindingSeverity) {
  return severity === "CRITICAL" || severity === "HIGH"
    ? "danger"
    : severity === "MEDIUM"
      ? "warning"
      : severity === "INFO"
        ? "info"
        : "neutral";
}

function headerTone(status: HeaderCheckStatus) {
  return status === "Present"
    ? "success"
    : status === "Missing"
      ? "danger"
      : status === "Weak"
        ? "warning"
        : "neutral";
}

function stat(label: string, value: string) {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function row(label: string, value: unknown) {
  return `<tr><th>${escapeHtml(label)}</th><td class="wrap">${escapeHtml(sentence(value))}</td></tr>`;
}

function severityBreakdown(counts: Record<FindingSeverity, number>) {
  return severityOrder
    .map((severity) => `${severity}: ${counts[severity]}`)
    .join(" | ");
}

function findingsBySeverity(findings: ReportFinding[]) {
  return [...findings].sort(
    (first, second) =>
      severityOrder.indexOf(first.severity) - severityOrder.indexOf(second.severity) ||
      first.title.localeCompare(second.title),
  );
}

function renderCategoryScores(data: ReportData) {
  return data.categoryScores
    .map(
      (category) => `
        <article class="card avoid-break">
          <div class="card-heading">
            <h3>${escapeHtml(category.category)}</h3>
            <div>${badge(`${category.score}/100`, "neutral")} ${badge(category.grade, "info")}</div>
          </div>
          <p>${escapeHtml(category.explanation)}</p>
          <dl class="inline-list">
            <div><dt>Finding count</dt><dd>${category.findingCount}</dd></div>
            <div><dt>Severity breakdown</dt><dd>${escapeHtml(severityBreakdown(category.severityCounts))}</dd></div>
            <div><dt>Explanation</dt><dd>${escapeHtml(category.status)}</dd></div>
          </dl>
        </article>
      `,
    )
    .join("");
}

type FindingLike = Pick<
  ReportFinding,
  "category" | "evidence" | "fix" | "severity" | "title"
>;

function hasTechnologyExposureFinding(findings: FindingLike[]) {
  return findings.some((finding) => {
    const haystack = `${finding.title} ${finding.evidence ?? ""} ${finding.fix ?? ""}`.toLowerCase();

    return (
      finding.category === "Technology Detection" &&
      finding.severity !== "INFO" &&
      !haystack.includes("inconclusive") &&
      (haystack.includes("public path") ||
        haystack.includes("xml-rpc") ||
        haystack.includes("xmlrpc") ||
        haystack.includes("phpmyadmin") ||
        haystack.includes(".env") ||
        haystack.includes(".git") ||
        haystack.includes("backup") ||
        haystack.includes("wp-login"))
    );
  });
}

function hasHeaderFinding(findings: FindingLike[]) {
  return findings.some((finding) => finding.category === "HTTP Security Headers");
}

function hasSslFinding(findings: FindingLike[]) {
  return findings.some((finding) => finding.category === "SSL/TLS");
}

function getOwaspRecommendation(
  relatedFindings: FindingLike[],
  recommendation: string,
  categoryName: string,
) {
  if (categoryName !== "Security Misconfiguration") {
    return recommendation;
  }

  const hasHeaders = hasHeaderFinding(relatedFindings);
  const hasTechExposure = hasTechnologyExposureFinding(relatedFindings);

  if (hasHeaders && hasTechExposure) {
    return "Harden missing response headers and review exposed technology indicators, public paths, or unnecessary endpoints found by the completed checks.";
  }

  if (hasHeaders) {
    return "Harden missing response headers and review remaining configuration findings.";
  }

  if (hasTechExposure) {
    return "Review exposed technology indicators, public paths, or unnecessary endpoints found by the completed checks.";
  }

  return recommendation;
}

function getOwaspLimitationNote(
  relatedFindings: FindingLike[],
  limitationNote: string,
  categoryName: string,
) {
  if (categoryName !== "Security Misconfiguration") {
    return limitationNote;
  }

  const hasHeaders = hasHeaderFinding(relatedFindings);
  const hasSsl = hasSslFinding(relatedFindings);
  const hasTechExposure = hasTechnologyExposureFinding(relatedFindings);

  if ((hasHeaders || hasSsl) && !hasTechExposure) {
    return "This covers implemented HTTP header and SSL/TLS configuration checks only.";
  }

  if (hasTechExposure) {
    return "This covers implemented HTTP header, SSL/TLS, and related Technology Detection checks with saved findings only.";
  }

  return limitationNote;
}

function isEmailAuthObservation(finding: ReportFinding) {
  if (finding.category !== "Email Security" || finding.severity !== "INFO") {
    return false;
  }

  const haystack = `${finding.title} ${finding.owaspMapping ?? ""}`.toLowerCase();

  return (
    haystack.includes("identification and authentication failures") ||
    haystack.includes("domain appears configured not to receive mail") ||
    haystack.includes("no dkim record found for common selectors tested") ||
    haystack.includes("spf record uses softfail") ||
    haystack.includes("softfail observation")
  );
}

function getIdentificationAuthObservations(data: ReportData) {
  return data.findings.filter(isEmailAuthObservation);
}

function uniqueFindingTitles(findings: Array<Pick<ReportFinding, "title">>) {
  return [...new Set(findings.map((finding) => finding.title))];
}

function renderRemediation(data: ReportData) {
  if (!data.remediationSummary) {
    return "<p>No saved remediation summary is available for this scan.</p>";
  }

  return remediationGroups
    .map((group) => {
      const items = data.remediationSummary?.[group.key] ?? [];

      return `
        <article class="card avoid-break">
          <h3>${escapeHtml(group.title)}</h3>
          ${
            items.length === 0
              ? "<p>No saved items in this group.</p>"
              : `<ul class="stack-list">${items
                  .map(
                    (item) => `
                      <li>
                        <strong>${escapeHtml(item.title)}</strong>
                        ${badge(item.severity, severityTone(item.severity))}
                        <p>${escapeHtml(item.category)}</p>
                        <p>${escapeHtml(item.recommendation)}</p>
                      </li>
                    `,
                  )
                  .join("")}</ul>`
          }
        </article>
      `;
    })
    .join("");
}

function renderFindings(data: ReportData) {
  if (data.findings.length === 0) {
    return "<p>No findings were saved for this scan.</p>";
  }

  return findingsBySeverity(data.findings)
    .map(
      (finding) => `
        <article class="finding avoid-break">
          <div class="card-heading">
            <h3>${escapeHtml(finding.title)}</h3>
            <div>${badge(finding.severity, severityTone(finding.severity))}</div>
          </div>
          <table>
            ${row("Category", finding.category)}
            ${row("Evidence", finding.evidence)}
            ${row("Impact", finding.impact)}
            ${row("Fix", finding.fix)}
            ${row("Confidence", finding.confidence)}
            ${row("OWASP mapping", finding.owaspMapping)}
          </table>
        </article>
      `,
    )
    .join("");
}

function renderOwasp(data: ReportData) {
  if (data.owaspChecklistItems.length === 0) {
    return "<p>No saved OWASP-aligned checklist items are available for this scan.</p>";
  }

  return data.owaspChecklistItems
    .map((item) => {
      const emailAuthObservations =
        item.categoryName === "Identification and Authentication Failures"
          ? getIdentificationAuthObservations(data)
          : [];
      const relatedCount =
        item.categoryName === "Identification and Authentication Failures" &&
        emailAuthObservations.length > 0
          ? uniqueFindingTitles([
              ...item.relatedFindings,
              ...emailAuthObservations,
            ]).length
          : item.relatedFindings.length;
      const status =
        item.categoryName === "Identification and Authentication Failures" &&
        emailAuthObservations.length > 0
          ? "OBSERVATION"
          : item.status;
      const evidenceSummary =
        item.categoryName === "Identification and Authentication Failures" &&
        emailAuthObservations.length > 0
          ? uniqueFindingTitles(emailAuthObservations).join(", ")
          : item.evidenceSummary;
      const recommendation =
        item.categoryName === "Identification and Authentication Failures" &&
        emailAuthObservations.length > 0
          ? "Review the saved email posture observation and confirm mail authentication settings with the domain's email provider if the domain sends email."
          : getOwaspRecommendation(
              item.relatedFindings,
              item.recommendation,
              item.categoryName,
            );
      const limitationNote =
        item.categoryName === "Identification and Authentication Failures" &&
        emailAuthObservations.length > 0
          ? "This is an email posture observation and not proof of authentication weakness."
          : getOwaspLimitationNote(
              item.relatedFindings,
              item.limitationNote,
              item.categoryName,
            );

      return `
        <article class="card avoid-break">
          <div class="card-heading">
            <h3>${escapeHtml(item.categoryName)}</h3>
            ${badge(status.replaceAll("_", " "), status === "ATTENTION_REQUIRED" ? "danger" : status === "OBSERVATION" ? "info" : "neutral")}
          </div>
          <table>
            ${row("Severity summary", item.severitySummary)}
            ${row("Evidence summary", evidenceSummary)}
            ${row("Related findings count", relatedCount)}
            ${row("Recommendation", recommendation)}
            ${row("Limitation note", limitationNote)}
          </table>
        </article>
      `;
    })
    .join("");
}

function renderHeaders(data: ReportData) {
  return HTTP_SECURITY_HEADER_NAMES.map((name) => {
    const summary = data.headerSummary.find((header) => header.name === name);
    const status = summary?.status ?? "Not checked";
    const detail =
      summary && summary.findingTitles.length > 0
        ? summary.findingTitles.join(", ")
        : summary?.note ?? "-";

    return `
      <tr>
        <th>${escapeHtml(name)}</th>
        <td>${badge(status, headerTone(status))}</td>
        <td>${escapeHtml(detail)}</td>
      </tr>
    `;
  }).join("");
}

function renderSsl(data: ReportData) {
  const ssl = data.sslSummary;

  return `
    <table>
      ${row("HTTPS availability", ssl ? (ssl.httpsAvailable ? "Available" : ssl.httpsError ?? "Missing") : "Not checked")}
      ${row("HTTP to HTTPS redirect", ssl?.httpRedirectsToHttps === null || !ssl ? "Not checked" : ssl.httpRedirectsToHttps ? "Yes" : "No")}
      ${row("Certificate status", !ssl ? "Not checked" : ssl.certificateValid ? "Valid" : ssl.authorizationError ?? "Not valid")}
      ${row("Issuer", ssl?.issuer)}
      ${row("Subject/common name", ssl?.subject)}
      ${row("Valid from", formatMaybeDate(ssl?.validFrom ?? null))}
      ${row("Valid to", formatMaybeDate(ssl?.validTo ?? null))}
      ${row("Days until expiry", ssl?.daysUntilExpiry ?? "-")}
      ${row("Hostname match", ssl?.hostnameMatched === null || !ssl ? "Not checked" : ssl.hostnameMatched ? "Yes" : "No")}
    </table>
  `;
}

function renderEmail(data: ReportData) {
  const email = data.emailSummary;

  return `
    <table>
      ${row("MX records", email?.mxRecords.length ? email.mxRecords.map((mx) => `${mx.exchange} (${mx.priority})`).join(", ") : email?.mxFound ? "Present" : "Not found")}
      ${row("SPF status and record", email ? `${email.spfFound ? "Present" : "Missing"} - ${email.spfRecord ?? email.spfAssessment}` : "Not checked")}
      ${row("DMARC status and policy", email ? `${email.dmarcFound ? "Present" : "Missing"} - ${email.dmarcPolicy ?? email.dmarcRecord ?? "-"}` : "Not checked")}
      ${row("DKIM common selector observation", email ? `${email.dkimSelectorsFound.length} of ${email.dkimSelectorsTested.length} common selectors observed` : "Not checked")}
    </table>
    <p class="note">${escapeHtml(dkimNote)}</p>
  `;
}

function renderTech(data: ReportData) {
  const tech = data.techSummary;

  return `
    <table>
      ${row("Technologies detected", tech?.technologiesDetected.length ? tech.technologiesDetected.join(", ") : "None detected")}
      ${row("WordPress status", tech ? (tech.wordpressDetected ? `Detected - ${tech.wordpressEvidence.join(", ")}` : "Not detected") : "Not checked")}
      ${row("WooCommerce status", tech ? (tech.woocommerceDetected ? `Detected - ${tech.woocommerceEvidence.join(", ")}` : "Not detected") : "Not checked")}
      ${row("XML-RPC status", tech ? (tech.xmlRpcAccessible ? `Accessible - ${tech.xmlRpcEvidence ?? "-"}` : "Not accessible") : "Not checked")}
      ${row("Server header", tech?.serverHeader)}
    </table>
    <h3>Public path observations</h3>
    ${
      tech && tech.exposedPathChecks.length > 0
        ? `<div class="tech-path-grid">${tech.exposedPathChecks
              .map(
                (check) => `
                  <article class="tech-path-card">
                    <div class="card-heading compact">
                      <h4>${escapeHtml(check.path)}</h4>
                      ${badge(check.status === "Inconclusive" ? "Inconclusive" : check.status, check.status === "Check failed" ? "danger" : "neutral")}
                    </div>
                    <dl class="compact-list">
                      <div><dt>Status</dt><dd>${escapeHtml(check.statusCode ? `HTTP ${check.statusCode}` : check.error ?? "-")}</dd></div>
                      <div><dt>Evidence</dt><dd>${escapeHtml(check.evidence ?? check.error ?? "-")}</dd></div>
                      <div><dt>Related finding</dt><dd>${escapeHtml(check.findingTitle ?? "-")}</dd></div>
                    </dl>
                  </article>
                `,
              )
              .join("")}</div>`
        : "<p>No saved public path observations are available.</p>"
    }
  `;
}

function renderBasicSeveritySummary(data: ReportData) {
  return severityOrder
    .map((severity) => `${severity}: ${data.severityCounts[severity]}`)
    .join(" | ");
}

function buildBasicRecommendations(data: ReportData) {
  return data.findings.flatMap((finding) => {
    const recommendation = sentence(finding.fix);

    if (recommendation === "-") {
      return [];
    }

    return [
      {
        category: finding.category,
        recommendation,
        severity: finding.severity,
        title: finding.title,
      },
    ];
  });
}

function renderBasicReportHtml(data: ReportData, generatedAt: Date) {
  const recommendations = buildBasicRecommendations(data);

  return assertNoForbiddenClaims(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Basic Website Security Posture Report - ${escapeHtml(data.scan.rootDomain)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.5; }
    h1, h2, h3 { color: #111827; margin: 0; }
    h1 { font-size: 26px; }
    h2 { font-size: 18px; margin-top: 18px; }
    h3 { font-size: 13px; margin-top: 10px; }
    p { margin: 6px 0 0; overflow-wrap: anywhere; word-break: break-word; }
    .card { border: 1px solid #d9e0ea; border-radius: 6px; padding: 10px; margin-top: 10px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .stat { border: 1px solid #d9e0ea; border-radius: 6px; padding: 10px; }
    .stat span { display: block; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .stat strong { display: block; margin-top: 4px; font-size: 16px; color: #111827; overflow-wrap: anywhere; word-break: break-word; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; border: 1px solid #cbd5e1; color: #334155; background: #f8fafc; }
    .badge.danger { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .badge.warning { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
    .badge.success { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .badge.info { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8px; }
    th, td { border: 1px solid #d9e0ea; padding: 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    th { width: 34%; background: #f5f7fa; color: #4b5870; font-size: 8.5px; line-height: 1.3; text-transform: uppercase; }
    .disclaimer { border-left: 4px solid #334155; background: #f8fafc; padding: 12px; margin-top: 14px; }
    .recommendation { border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>Basic Website Security Posture Report</h1>
    <div class="card">
      <div class="grid">
        <div class="stat"><span>Target domain</span><strong>${escapeHtml(data.scan.rootDomain)}</strong></div>
        <div class="stat"><span>Scan type</span><strong>BASIC</strong></div>
        <div class="stat"><span>Generated date</span><strong>${escapeHtml(formatDate(generatedAt))}</strong></div>
        <div class="stat"><span>Score</span><strong>${escapeHtml(`${data.scan.score}/100`)}</strong></div>
        <div class="stat"><span>Grade</span><strong>${escapeHtml(data.scan.grade)}</strong></div>
        <div class="stat"><span>Total findings</span><strong>${escapeHtml(String(data.findings.length))}</strong></div>
      </div>
      <p><strong>Severity summary:</strong> ${escapeHtml(renderBasicSeveritySummary(data))}</p>
    </div>

    <section>
      <h2>HTTP Security Headers</h2>
      <table>
        <thead><tr><th>Header</th><th>Status</th><th>Summary</th></tr></thead>
        <tbody>${renderHeaders(data)}</tbody>
      </table>
    </section>

    <section>
      <h2>SSL/TLS</h2>
      ${renderSsl(data)}
    </section>

    <section>
      <h2>Email Security</h2>
      ${renderEmail(data)}
    </section>

    <section>
      <h2>Basic Technology Detection</h2>
      ${renderTech(data)}
    </section>

    <section>
      <h2>Basic Recommendations</h2>
      <div class="card">
        ${
          recommendations.length > 0
            ? recommendations
                .map(
                  (item) => `
                    <article class="recommendation">
                      <p><strong>${escapeHtml(item.title)}</strong> ${badge(item.severity, severityTone(item.severity))}</p>
                      <p>${escapeHtml(item.category)}</p>
                      <p>${escapeHtml(item.recommendation)}</p>
                    </article>
                  `,
                )
                .join("")
            : "<p>No basic recommendations are available from saved findings.</p>"
        }
      </div>
    </section>

    <p class="disclaimer">${escapeHtml(disclaimer)}</p>
  </main>
</body>
</html>`);
}

function assertNoForbiddenClaims(html: string) {
  const lowerHtml = html.toLowerCase();
  const forbiddenClaim = forbiddenGeneratedClaims.find((claim) =>
    lowerHtml.includes(claim.toLowerCase()),
  );

  if (forbiddenClaim) {
    throw new Error(`Generated report HTML contains forbidden claim: ${forbiddenClaim}`);
  }

  return html;
}

function normalizeBranding(branding?: ReportBranding | null) {
  if (!branding) {
    return null;
  }

  return {
    ...branding,
    primaryColor: isValidHexColor(branding.primaryColor)
      ? branding.primaryColor
      : "#0f172a",
    secondaryColor:
      branding.secondaryColor && isValidHexColor(branding.secondaryColor)
        ? branding.secondaryColor
        : null,
  };
}

function renderBrandLogo(branding: ReportBranding | null) {
  if (!branding?.agencyLogoDataUri) {
    return "";
  }

  return `<img class="brand-logo" src="${branding.agencyLogoDataUri}" alt="Agency logo" />`;
}

export function renderReportHtml(
  data: ReportData,
  generatedAt = new Date(),
  branding?: ReportBranding | null,
) {
  if (data.scan.scanType === "BASIC") {
    return renderBasicReportHtml(data, generatedAt);
  }

  const activeBranding = normalizeBranding(branding);
  const brandName = activeBranding?.agencyName ?? "SMB Security Report Generator";
  const primaryColor = activeBranding?.primaryColor ?? "#334155";
  const secondaryColor = activeBranding?.secondaryColor ?? "#475569";
  const footerText = activeBranding?.footerText ?? "Generated by SMB Security Report Generator";
  const contactLine = [activeBranding?.websiteUrl, activeBranding?.contactEmail]
    .filter(Boolean)
    .join(" | ");
  const poweredBy =
    !activeBranding || activeBranding.showPoweredBy
      ? "Powered by SMB Security Report Generator"
      : "";

  return assertNoForbiddenClaims(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Website Security Posture Report - ${escapeHtml(data.scan.rootDomain)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 22mm; }
    * { box-sizing: border-box; }
    html, body { min-width: 0; }
    body { margin: 0 0 18mm; color: #172033; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.5; }
    h1, h2, h3 { color: #101827; line-height: 1.2; margin: 0; }
    h4 { color: #101827; font-size: 11px; line-height: 1.25; margin: 0; overflow-wrap: anywhere; word-break: break-word; }
    h1 { font-size: 32px; max-width: 680px; overflow-wrap: anywhere; word-break: break-word; }
    h2 { font-size: 20px; margin: 0 0 12px; break-after: avoid; page-break-after: avoid; }
    h3 { font-size: 14px; break-after: avoid; page-break-after: avoid; }
    p { margin: 5px 0 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 10px; }
    th, td { border: 1px solid #d9e0ea; padding: 7px; text-align: left; vertical-align: top; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    th { width: 36%; background: #f5f7fa; color: #4b5870; font-size: 8.5px; line-height: 1.3; text-transform: uppercase; overflow-wrap: normal; word-break: normal; white-space: normal; }
    thead { display: table-header-group; break-inside: avoid; page-break-inside: avoid; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    section { padding-top: 10px; margin: 12px 0 18mm; break-inside: auto; page-break-inside: auto; }
    section.major { break-before: page; page-break-before: always; }
    section.keep-together { break-inside: avoid; page-break-inside: avoid; }
    .cover { min-height: 860px; display: flex; flex-direction: column; justify-content: space-between; break-after: page; page-break-after: always; }
    .brand { color: ${primaryColor}; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .brand-row { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
    .brand-logo { display: block; max-width: 160px; max-height: 70px; width: auto; height: auto; object-fit: contain; }
    .subtitle { color: #475569; font-size: 17px; margin-top: 12px; overflow-wrap: anywhere; word-break: break-word; }
    .disclaimer { border-left: 4px solid ${primaryColor}; background: #f8fafc; padding: 14px; color: #334155; break-inside: avoid; page-break-inside: avoid; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
    .stat, .card, .finding { min-width: 0; border: 1px solid #d9e0ea; border-radius: 6px; padding: 11px; background: #fff; overflow: hidden; }
    .stat span, dt { display: block; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .stat strong { display: block; margin-top: 4px; font-size: 17px; color: #111827; overflow-wrap: anywhere; word-break: break-word; }
    .card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .card-heading.compact { gap: 8px; margin-bottom: 6px; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; border: 1px solid #cbd5e1; color: #334155; background: #f8fafc; white-space: normal; }
    .badge.danger { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .badge.warning { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
    .badge.success { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .badge.info { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
    .inline-list { display: grid; gap: 8px; margin: 0; }
    .inline-list dd { margin: 2px 0 0; overflow-wrap: anywhere; word-break: break-word; }
    .compact-list { display: grid; gap: 4px; margin: 0; }
    .compact-list div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 6px; }
    .compact-list dt { font-size: 8px; }
    .compact-list dd { margin: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .stack-list { display: grid; gap: 10px; list-style: none; margin: 10px 0 0; padding: 0; }
    .stack-list li { min-width: 0; border-top: 1px solid #e2e8f0; padding-top: 8px; break-inside: avoid; page-break-inside: avoid; }
    .finding { margin-bottom: 12px; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    .section-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8mm; }
    .tech-path-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
    .tech-path-card { min-width: 0; border: 1px solid #d9e0ea; border-radius: 5px; padding: 7px; break-inside: avoid; page-break-inside: avoid; }
    .note { color: #475569; font-size: 11px; }
    .wrap { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .accent { height: 4px; width: 100%; background: ${primaryColor}; margin: 20px 0; }
    .footer { position: fixed; bottom: 5mm; left: 14mm; right: 14mm; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 8px 14px; align-items: start; color: #64748b; font-size: 8.8px; line-height: 1.35; border-top: 1px solid #e2e8f0; padding-top: 5px; background: #fff; }
    .footer-branding { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .footer-date { white-space: nowrap; text-align: right; }
    .muted-brand { color: ${secondaryColor}; }
  </style>
</head>
<body>
  <div class="footer">
    <span class="footer-branding">${escapeHtml(footerText)}${contactLine ? ` | ${escapeHtml(contactLine)}` : ""}${poweredBy ? ` | ${escapeHtml(poweredBy)}` : ""}</span>
    <span class="footer-date">${escapeHtml(formatDate(generatedAt))}</span>
  </div>

  <main>
    <div class="cover">
      <div>
        <div class="brand-row">
          ${renderBrandLogo(activeBranding)}
          <p class="brand">${escapeHtml(brandName)}</p>
        </div>
        <h1>Website Security Posture Report</h1>
        <div class="accent"></div>
        <p class="subtitle">${escapeHtml(data.scan.rootDomain)}</p>
        <div class="stat-grid">
          ${stat("Target domain", data.scan.rootDomain)}
          ${stat("Normalized URL", data.scan.normalizedUrl)}
          ${stat("Scan date", formatDate(data.scan.completedAt ?? data.scan.createdAt))}
          ${stat("Score", `${data.scan.score}/100`)}
          ${stat("Grade", data.scan.grade)}
          ${stat("Status", data.scan.status)}
          ${activeBranding?.contactEmail ? stat("Contact", activeBranding.contactEmail) : ""}
          ${activeBranding?.websiteUrl ? stat("Website", activeBranding.websiteUrl) : ""}
        </div>
      </div>
      <div class="disclaimer">${escapeHtml(disclaimer)}</div>
    </div>

    <section>
      <h2>Executive Summary</h2>
      <div class="stat-grid">
        ${stat("Score", `${data.scan.score}/100`)}
        ${stat("Grade", data.scan.grade)}
        ${stat("Total findings", String(data.findings.length))}
        ${stat("Critical count", String(data.severityCounts.CRITICAL))}
        ${stat("High count", String(data.severityCounts.HIGH))}
        ${stat("Medium count", String(data.severityCounts.MEDIUM))}
        ${stat("Low count", String(data.severityCounts.LOW))}
        ${stat("Info count", String(data.severityCounts.INFO))}
        ${stat("Highest severity found", data.scoreExplanation.highestSeverityFound)}
        ${stat("Scored findings", String(data.scoreExplanation.findingsCounted))}
        ${stat("Penalty summary", data.scoreExplanation.penaltySummary)}
      </div>
      <div class="card avoid-break" style="margin-top: 12px;">
        <h3>Automated posture score</h3>
        <p>Based on completed safe checks and findings from completed scanner modules.</p>
        <p>Info observations are shown but do not reduce the score.</p>
      </div>
    </section>

    <section>
      <h2>Category Scores</h2>
      <div class="grid">${renderCategoryScores(data)}</div>
    </section>

    <section class="major">
      <h2>Priority Remediation Summary</h2>
      <div class="grid">${renderRemediation(data)}</div>
    </section>

    <section class="major">
      <h2>Detailed Findings</h2>
      ${renderFindings(data)}
    </section>

    <section class="major">
      <h2>OWASP-aligned posture checklist</h2>
      <div class="grid">${renderOwasp(data)}</div>
    </section>

    <section class="major">
      <h2>HTTP Security Headers</h2>
      <table>
        <thead><tr><th>Header</th><th>Status</th><th>Summary</th></tr></thead>
        <tbody>${renderHeaders(data)}</tbody>
      </table>
    </section>

    <section class="keep-together">
      <h2>SSL/TLS</h2>
      <div class="section-block">${renderSsl(data)}</div>
    </section>

    <section class="keep-together">
      <h2>Email Security</h2>
      <div class="section-block">${renderEmail(data)}</div>
    </section>

    <section class="keep-together">
      <h2>Tech Detection</h2>
      <div class="section-block">${renderTech(data)}</div>
    </section>
  </main>
</body>
</html>`);
}

export { disclaimer as reportDisclaimer };
