import { describe, it, expect } from "vitest";
import { compileModelVersion } from "./index.js";

describe("engine smoke", () => {
  it("exports compiler functions", () => {
    expect(typeof compileModelVersion).toBe("function");
  });
});
