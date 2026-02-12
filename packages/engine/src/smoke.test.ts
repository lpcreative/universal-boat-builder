import { describe, it, expect } from "vitest";
import { compileModelVersion, validateModelConfig, validateRules } from "./index.js";

describe("engine smoke", () => {
  it("exports compiler functions", () => {
    expect(typeof compileModelVersion).toBe("function");
    expect(typeof validateRules).toBe("function");
    expect(typeof validateModelConfig).toBe("function");
  });
});
