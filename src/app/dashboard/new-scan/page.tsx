import { redirect } from "next/navigation";

export default function LegacyNewScanPage() {
  redirect("/dashboard/scans/new");
}
