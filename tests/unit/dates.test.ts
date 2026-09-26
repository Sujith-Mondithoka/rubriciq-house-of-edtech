import { describe, expect, it } from "vitest";

import { fromLocalInputValue, isLate, toLocalInputValue } from "@/lib/dates";

describe("datetime-local helpers", () => {
  it("round-trips a local date to the minute", () => {
    const date = new Date(2026, 9, 1, 17, 30); // local time
    expect(toLocalInputValue(date)).toBe("2026-10-01T17:30");
    expect(fromLocalInputValue("2026-10-01T17:30")?.getTime()).toBe(date.getTime());
  });

  it.each(["", "2026-10-01", "2026-10-01 17:30", "2026-13-45T99:99", "yesterday"])(
    "rejects %j",
    (value) => expect(fromLocalInputValue(value)).toBeNull(),
  );
});

describe("isLate", () => {
  const due = new Date("2026-10-01T12:00:00Z");
  it("is on time up to and including the deadline", () => {
    expect(isLate(new Date("2026-10-01T11:59:59Z"), due)).toBe(false);
    expect(isLate(due, due)).toBe(false);
  });
  it("is late one millisecond after", () => {
    expect(isLate(new Date(due.getTime() + 1), due)).toBe(true);
  });
});
