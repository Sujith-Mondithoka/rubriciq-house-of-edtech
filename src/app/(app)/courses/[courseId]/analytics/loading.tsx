export default function AnalyticsLoading() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading analytics">
      <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
