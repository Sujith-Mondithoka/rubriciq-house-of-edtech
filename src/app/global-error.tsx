"use client";

import "./globals.css";

import { RouteError } from "@/components/common/route-error";

/** Last resort when the root layout itself fails: it must render its own <html> and <body>. */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-6xl px-4 py-16">
        <RouteError {...props} />
      </body>
    </html>
  );
}
