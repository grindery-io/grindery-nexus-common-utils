import { describe, expect, test } from "@jest/globals";
import { replaceTokens } from "./utils";

describe("replaceTokens", () => {
  test("simple replacement", () => {
    expect(replaceTokens("{{ test }}", { test: 1 })).toBe("1");
  });
});
