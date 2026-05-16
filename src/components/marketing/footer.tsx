import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { marketingNavItems, siteConfig } from "@/lib/site";

function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">{siteConfig.name}</span>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            Built for safe, basic website configuration checks and professional
            posture reporting. It is not a penetration testing, exploit, brute
            force, or port scanning tool.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {marketingNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}

export { Footer };
