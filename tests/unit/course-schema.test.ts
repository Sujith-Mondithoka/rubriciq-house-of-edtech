import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "@/lib/errors";
import { MAX_PAGE_SIZE, pageWindow, parsePage, toPage } from "@/lib/pagination";
import {
  addTaSchema,
  COURSE_NAME_MAX,
  createCourseSchema,
  JOIN_CODE_ALPHABET,
  joinCourseSchema,
  removeMemberSchema,
  setCourseAiSchema,
  updateCourseSchema,
} from "@/lib/validation/course.schema";
import { generateJoinCode } from "@/server/services/course.service";

const UUID = "0b7e7f4a-3c1d-4e8b-9a2f-5d6c7b8a9e01";

describe("createCourseSchema", () => {
  it("trims the name and description", () => {
    expect(createCourseSchema.parse({ name: "  Essays ", description: " Intro " })).toEqual({
      name: "Essays",
      description: "Intro",
    });
  });

  it.each<[unknown, string]>([
    [{ name: "   ", description: "" }, "blank name"],
    [{ name: "x".repeat(COURSE_NAME_MAX + 1), description: "" }, "name too long"],
    [{ name: "Essays", description: "x".repeat(1001) }, "description too long"],
    [{ name: "Essays", description: "", joinCode: "HACKED" }, "unknown key"],
    [{ name: 42, description: "" }, "wrong type"],
  ])("rejects %j (%s)", (input) => {
    expect(createCourseSchema.safeParse(input).success).toBe(false);
  });
});

describe("course id fields", () => {
  it("require UUIDs", () => {
    expect(
      updateCourseSchema.safeParse({ courseId: "1", name: "A", description: "" }).success,
    ).toBe(false);
    expect(removeMemberSchema.safeParse({ memberId: "' OR 1=1 --" }).success).toBe(false);
    expect(removeMemberSchema.safeParse({ memberId: UUID }).success).toBe(true);
  });

  it("the AI switch takes a real boolean only", () => {
    expect(setCourseAiSchema.safeParse({ courseId: UUID, aiEnabled: "false" }).success).toBe(false);
    expect(setCourseAiSchema.parse({ courseId: UUID, aiEnabled: false })).toEqual({
      courseId: UUID,
      aiEnabled: false,
    });
  });
});

describe("joinCourseSchema", () => {
  it.each([
    ["demo2026", "DEMO2026"],
    [" demo-2026 ", "DEMO2026"],
    ["AB CD EF GH", "ABCDEFGH"],
  ])("normalises %j to %s", (joinCode, expected) => {
    expect(joinCourseSchema.parse({ joinCode })).toEqual({ joinCode: expected });
  });

  it.each(["", "ABC", "ABCDEFGHIJKLM", "DEMO_2026", "DÉMO2026"])("rejects %j", (joinCode) => {
    expect(joinCourseSchema.safeParse({ joinCode }).success).toBe(false);
  });
});

describe("addTaSchema", () => {
  it("normalises the email", () => {
    expect(addTaSchema.parse({ courseId: UUID, email: "  TA@Example.COM " }).email).toBe(
      "ta@example.com",
    );
  });

  it("rejects invalid emails", () => {
    expect(addTaSchema.safeParse({ courseId: UUID, email: "not-an-email" }).success).toBe(false);
  });
});

describe("generateJoinCode", () => {
  it("uses only unambiguous characters and passes its own validation", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toMatch(new RegExp(`^[${JOIN_CODE_ALPHABET}]{8}$`));
      expect(joinCourseSchema.parse({ joinCode: code }).joinCode).toBe(code);
    }
  });

  it("never uses look-alike characters", () => {
    for (const ch of "01OIL") expect(JOIN_CODE_ALPHABET).not.toContain(ch);
  });
});

describe("pagination", () => {
  it.each([
    [undefined, 1],
    ["3", 3],
    [["2", "9"], 2],
    ["0", 1],
    ["-4", 1],
    ["abc", 1],
    ["1.5", 1],
  ])("parsePage(%j) → page %i", (value, page) => {
    expect(parsePage(value).page).toBe(page);
  });

  it("caps the page size at the maximum", () => {
    expect(parsePage("1", 500).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("fetches one extra row to detect the next page", () => {
    const request = { page: 3, pageSize: 10 };
    expect(pageWindow(request)).toEqual({ limit: 11, offset: 20 });
    const rows = Array.from({ length: 11 }, (_, i) => i);
    expect(toPage(rows, request)).toEqual({ items: rows.slice(0, 10), page: 3, hasMore: true });
    expect(toPage(rows.slice(0, 4), request).hasMore).toBe(false);
  });
});

describe("isUniqueViolation", () => {
  it("matches a pg error directly or wrapped by Drizzle, optionally by constraint", () => {
    const pg = { code: "23505", constraint: "course_join_code_unique" };
    expect(isUniqueViolation(pg)).toBe(true);
    expect(isUniqueViolation({ cause: pg }, "course_join_code_unique")).toBe(true);
    expect(isUniqueViolation(pg, "other_constraint")).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
