import { describe, expect, it } from "vitest";
import { validateRules } from "./rules-validation.js";

describe("validateRules", () => {
  it("accepts a valid ruleset", () => {
    const validRuleset = {
      rules: [
        {
          id: "show-rigging-field",
          priority: 10,
          when: { eq: ["engine_type", "outboard"] },
          then: [{ action: "showField", fieldId: "rigging_package" }],
        },
      ],
    };

    const report = validateRules(validRuleset);

    expect(report.ok).toBe(true);
    expect(report.summary.errors).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("rejects an invalid ruleset", () => {
    const invalidRuleset = {
      rules: [
        {
          id: "broken-rule",
          priority: 1,
          when: { eq: ["engine_type", "outboard"] },
          then: [{ action: "showField" }],
        },
      ],
    };

    const report = validateRules(invalidRuleset);

    expect(report.ok).toBe(false);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.pointer === "rules[0].then[0].fieldId")).toBe(true);
  });
});
