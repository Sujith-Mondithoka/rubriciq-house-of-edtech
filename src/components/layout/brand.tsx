import { ListChecksIcon } from "lucide-react";
import Link from "next/link";

import { siteConfig } from "@/lib/site";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
      >
        <ListChecksIcon className="size-4" />
      </span>
      {siteConfig.name}
    </Link>
  );
}
