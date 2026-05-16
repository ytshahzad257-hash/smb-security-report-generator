import type { ReactNode } from "react";

import { Footer } from "@/components/marketing/footer";
import { PublicNavbar } from "@/components/marketing/public-navbar";

type PublicLayoutProps = {
  children: ReactNode;
};

function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="flex min-h-screen max-w-full flex-col overflow-x-hidden bg-background">
      <PublicNavbar />
      <main className="min-w-0 flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export { PublicLayout };
