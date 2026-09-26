import { describe, expect, it } from "vitest";

import { countWords } from "@/lib/text";

describe("countWords", () => {
  it.each([
    ["", 0],
    ["   \n\t ", 0],
    ["one", 1],
    ["  two   words  ", 2],
    ["line one\nline two\n\nline three", 6],
    ["don't split contractions", 3],
    ["non-ASCII: café naïve résumé", 4],
  ])("counts %j as %i words", (input, expected) => {
    expect(countWords(input)).toBe(expected);
  });
});
