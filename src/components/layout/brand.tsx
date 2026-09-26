import Link from "next/link";

import { siteConfig } from "@/lib/site";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="rounded-sm font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {siteConfig.name}
    </Link>
  );
}
