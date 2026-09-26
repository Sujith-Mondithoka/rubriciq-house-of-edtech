export default function GraderLoading() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading the submission">
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
