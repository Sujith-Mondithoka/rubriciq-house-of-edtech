"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

type CourseNavProps = {
  courseId: string;
  showMembers: boolean;
  showAnalytics: boolean;
  showSettings: boolean;
};

export function CourseNav({ courseId, showMembers, showAnalytics, showSettings }: CourseNavProps) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;
  const links = [
    { href: base, label: "Overview" },
    ...(showMembers ? [{ href: `${base}/members`, label: "Members" }] : []),
    ...(showAnalytics ? [{ href: `${base}/analytics`, label: "Analytics" }] : []),
    ...(showSettings ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];

  return (
    <nav aria-label="Course" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 border-b">
        {links.map(({ href, label }) => {
          const active = href === base ? pathname === base : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
