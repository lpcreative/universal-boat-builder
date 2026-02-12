import { describe, it, expect } from "vitest";
import { compileModelVersion, selectActiveLayersByView, validateRules } from "./index.js";

describe("engine smoke", () => {
  it("exports compiler functions", () => {
    expect(typeof compileModelVersion).toBe("function");
    expect(typeof validateRules).toBe("function");
    expect(typeof selectActiveLayersByView).toBe("function");
  });
});
