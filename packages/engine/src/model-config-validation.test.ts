import { describe, expect, it } from "vitest";
import type { FieldDef, ModelConfig } from "./model-config.js";
import { validateModelConfig } from "./model-config-validation.js";

describe("validateModelConfig", () => {
  it("accepts a valid model config", () => {
    const report = validateModelConfig(createValidModelConfig());

    expect(report.ok).toBe(true);
    expect(report.summary.errors).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("reports missing referenced option", () => {
    const config = createValidModelConfig();
    config.rules.rules = [
      {
        id: "disable-missing-option",
        priority: 10,
        when: { eq: ["hull_color", "red"] },
        then: [{ action: "disableOption", fieldId: "hull_color", optionId: "blue" }],
      },
    ];

    const report = validateModelConfig(config);

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.pointer === "rules.rules[0].then[0].optionId")).toBe(true);
    expect(report.issues.some((issue) => issue.message.includes('missing referenced option "blue"'))).toBe(true);
  });

  it("reports duplicate field ids", () => {
    const config = createValidModelConfig();
    config.form.steps.push({
      id: "options",
      title: "Options",
      order: 2,
      sections: [
        {
          id: "another-section",
          title: "Another Section",
          order: 1,
          fields: [buildField("hull_color", "Hull Color Copy", 1)],
        },
      ],
    });

    const report = validateModelConfig(config);

    expect(report.ok).toBe(false);
    expect(
      report.issues.some(
        (issue) =>
          issue.pointer === "form.steps[1].sections[0].fields[0].id" &&
          issue.message.includes('duplicate field id "hull_color"'),
      ),
    ).toBe(true);
  });

  it("reports invalid step->section->field chain in fieldsById", () => {
    const config = createValidModelConfig();
    config.form.fieldsById = {
      orphan_field: buildField("orphan_field", "Orphan Field", 99),
    };

    const report = validateModelConfig(config);

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.pointer === "form.fieldsById.orphan_field")).toBe(true);
    expect(
      report.issues.some((issue) =>
        issue.message.includes('fieldsById references field "orphan_field" that is not present'),
      ),
    ).toBe(true);
  });
});

function createValidModelConfig(): ModelConfig {
  const hullColorField = buildField("hull_color", "Hull Color", 1);

  return {
    meta: {
      clientId: "client-1",
      clientSlug: "demo-client",
      modelId: "model-1",
      modelSlug: "demo-model",
      modelVersionId: "version-1",
      versionLabel: "v1",
      publishedAtISO: "2026-01-01T00:00:00.000Z",
    },
    branding: {},
    form: {
      steps: [
        {
          id: "appearance",
          title: "Appearance",
          order: 1,
          sections: [
            {
              id: "hull",
              title: "Hull",
              order: 1,
              fields: [hullColorField],
            },
          ],
        },
      ],
      fieldsById: {
        hull_color: hullColorField,
      },
    },
    rules: {
      rules: [],
    },
    pricing: {
      mode: "msrp",
      basePrice: {
        amount: 100000,
        currency: "USD",
      },
    },
    rendering: {
      views: [
        {
          id: "profile",
          label: "Profile",
          width: 1920,
          height: 1080,
          layers: [],
        },
      ],
      galleries: [
        {
          id: "hull-gallery",
          label: "Hull Gallery",
          media: [{ url: "https://cdn.example.com/hull-red.jpg" }],
        },
      ],
    },
  };
}

function buildField(id: string, label: string, order: number): FieldDef {
  return {
    id,
    type: "single_select",
    label,
    order,
    options: [
      {
        id: "red",
        label: "Red",
        preview: {
          mode: "gallery",
          galleryId: "hull-gallery",
        },
      },
    ],
  };
}
