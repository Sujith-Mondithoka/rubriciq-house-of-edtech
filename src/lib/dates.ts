/** `YYYY-MM-DDTHH:mm` in the runtime's local time zone, for `<input type="datetime-local">`. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Interprets a datetime-local value in the runtime's time zone; null if empty or invalid. */
export function fromLocalInputValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whether a submission made at `at` is late for a deadline. Exactly on time is not late. */
export function isLate(at: Date, dueAt: Date): boolean {
  return at.getTime() > dueAt.getTime();
}
