import { describe, expect, test } from "@jest/globals";
import { replaceTokens } from "./replaceTokens";

describe("replaceTokens", () => {
  test("simple", () => {
    expect(replaceTokens("{{ test }}", { test: 1 })).toBe("1");
  });
  test("nested", () => {
    expect(replaceTokens("{{ test.nested }}", { test: { nested: 1 } })).toBe("1");
  });
  test("json", () => {
    expect(replaceTokens("{{ test.nested|json }}", { test: { nested: {} } })).toBe("{}");
  });
  test("urlencode", () => {
    expect(replaceTokens("{{ test.nested|urlencode }}", { test: { nested: "/" } })).toBe("%2F");
  });
  test("escaped", () => {
    expect(replaceTokens("{{ '{{' }}", {})).toBe("{{");
  });
  test("nested object", () => {
    expect(
      replaceTokens(
        {
          field1: "{{ a }}",
          nested: { value: "{{ b }}" },
          array: ["{{ c }}", { value: "{{ d }}" }],
        },
        { a: 1, b: 2, c: 3, d: 4 }
      )
    ).toMatchObject({
      field1: "1",
      nested: { value: "2" },
      array: ["3", { value: "4" }],
    });
  });
});
