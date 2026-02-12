import { describe, expect, it } from "vitest";
import type { ModelConfig } from "./model-config.js";
import { evaluateRules } from "./evaluate-rules.js";

const modelConfig: Pick<ModelConfig, "form" | "rules"> = {
  form: {
    steps: [
      {
        id: "power",
        title: "Power",
        order: 1,
        sections: [
          {
            id: "engines",
            title: "Engines",
            order: 1,
            fields: [
              {
                id: "engine_type",
                type: "single_select",
                label: "Engine Type",
                order: 1,
                options: [
                  { id: "outboard", label: "Outboard" },
                  { id: "inboard", label: "Inboard" },
                ],
              },
              {
                id: "rigging_package",
                type: "single_select",
                label: "Rigging Package",
                order: 2,
                options: [
                  { id: "mechanical", label: "Mechanical" },
                  { id: "digital", label: "Digital" },
                ],
              },
              {
                id: "joystick",
                type: "toggle",
                label: "Joystick",
                order: 3,
              },
            ],
          },
        ],
      },
    ],
  },
  rules: {
    rules: [],
  },
};

describe("evaluateRules", () => {
  it("supports chained setValue mutations through the stability loop", () => {
    const rulesConfig: Pick<ModelConfig, "form" | "rules"> = {
      ...modelConfig,
      rules: {
        rules: [
          {
            id: "set-joystick-from-rigging",
            priority: 10,
            when: { eq: ["rigging_package", "digital"] },
            then: [{ action: "setValue", fieldId: "joystick", value: true }],
          },
          {
            id: "set-rigging-from-engine",
            priority: 20,
            when: { eq: ["engine_type", "outboard"] },
            then: [{ action: "setValue", fieldId: "rigging_package", value: "digital" }],
          },
        ],
      },
    };

    const result = evaluateRules(rulesConfig, { engine_type: "outboard" }, { maxIterations: 6 });

    expect(result.state.rigging_package).toBe("digital");
    expect(result.state.joystick).toBe(true);
    expect(result.mutations).toEqual([
      { action: "setValue", fieldId: "rigging_package", value: "digital" },
      { action: "setValue", fieldId: "joystick", value: true },
    ]);
    expect(result.stable).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
  });

  it("auto-clears selected options that become disabled", () => {
    const rulesConfig: Pick<ModelConfig, "form" | "rules"> = {
      ...modelConfig,
      rules: {
        rules: [
          {
            id: "disable-digital-for-inboard",
            priority: 50,
            when: { eq: ["engine_type", "inboard"] },
            then: [{ action: "disableOption", fieldId: "rigging_package", optionId: "digital" }],
          },
        ],
      },
    };

    const result = evaluateRules(rulesConfig, { engine_type: "inboard", rigging_package: "digital" });

    expect(result.computedUi.disabled.optionIdsByFieldId.rigging_package).toEqual(["digital"]);
    expect(result.state.rigging_package).toBeNull();
    expect(result.mutations).toEqual([{ action: "clearValue", fieldId: "rigging_package" }]);
    expect(result.stable).toBe(true);
  });
});
