export default function GradingQueueLoading() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading the grading queue">
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
