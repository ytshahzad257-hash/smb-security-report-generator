import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: {
    default: "SMB Security Report Generator",
    template: "%s | SMB Security Report Generator",
  },
  description:
    "Professional website security posture reports for small businesses, agencies, freelancers, ecommerce stores, and software houses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full overflow-x-hidden bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
