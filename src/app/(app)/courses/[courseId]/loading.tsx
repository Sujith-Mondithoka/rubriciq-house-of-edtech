export default function CourseLoading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <span className="sr-only">Loading…</span>
      <div className="h-16 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
