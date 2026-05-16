import { mkdir } from "fs/promises";
import path from "path";
import { chromium } from "playwright";

export const REPORTS_PUBLIC_DIR = path.join(process.cwd(), "public", "generated-reports");

export function getReportFileName(scanId: string) {
  return `report-${scanId.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
}

export function getReportStoragePath(scanId: string) {
  return path.join(REPORTS_PUBLIC_DIR, getReportFileName(scanId));
}

export function getReportPublicUrl(scanId: string) {
  return `/generated-reports/${getReportFileName(scanId)}`;
}

export async function generatePdfFromHtml(html: string, outputPath: string) {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { height: 1123, width: 794 },
    });

    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      displayHeaderFooter: false,
      format: "A4",
      margin: {
        bottom: "16mm",
        left: "14mm",
        right: "14mm",
        top: "18mm",
      },
      path: outputPath,
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
