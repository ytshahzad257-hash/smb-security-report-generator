import { readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { NextResponse } from "next/server";

import { generatePdfFromHtml } from "@/lib/reports/pdfGenerator";
import { renderReportHtml, reportDisclaimer } from "@/lib/reports/reportHtml";
import {
  sampleGeneratedAt,
  sampleReportData,
  sampleReportDisclaimer,
} from "@/lib/reports/sampleReportData";

export async function GET() {
  const outputPath = path.join(tmpdir(), "smb-security-sample-report.pdf");
  const html = renderReportHtml(sampleReportData, sampleGeneratedAt, {
    address: null,
    agencyLogoDataUri: null,
    agencyName: "SMB Security Report Generator",
    contactEmail: null,
    footerText: "SAMPLE/DEMO report generated from static data",
    logoPath: null,
    logoUrl: null,
    primaryColor: "#0f766e",
    secondaryColor: "#334155",
    showPoweredBy: true,
    websiteUrl: null,
  }).replace(reportDisclaimer, sampleReportDisclaimer);

  try {
    await generatePdfFromHtml(html, outputPath);
    const file = await readFile(outputPath);

    return new Response(file, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition":
          'attachment; filename="smb-security-sample-report.pdf"',
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Sample PDF is temporarily unavailable.",
        success: false,
      },
      { status: 503 },
    );
  }
}
