import Link from "next/link";

import { Button } from "@/components/ui/button";

type PaginationNavProps = {
  page: number;
  hasMore: boolean;
  /** Builds the URL for a page, keeping the other query params. */
  hrefFor: (page: number) => string;
  label: string;
};

/** Previous/next links; the page number lives in the URL (?page=). */
export function PaginationNav({ page, hasMore, hrefFor, label }: PaginationNavProps) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Button asChild variant="outline" size="lg">
          <Link href={hrefFor(page - 1)} rel="prev">
            Previous
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">Page {page}</span>
      {hasMore ? (
        <Button asChild variant="outline" size="lg">
          <Link href={hrefFor(page + 1)} rel="next">
            Next
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
