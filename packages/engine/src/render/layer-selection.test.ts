import { describe, expect, it } from "vitest";
import type { ConditionExpr, LayerDef, ModelConfig, ViewId } from "../model-config.js";
import { selectActiveLayersByView } from "./layer-selection.js";

describe("selectActiveLayersByView", () => {
  it("keeps base layers when selected options do not have image layers", () => {
    const modelConfig = createTestModelConfig([
      profileLayer("profile-hull", 0, { eq: ["always", true] }),
      profileLayer("profile-upholstery-red", 10, { eq: ["upholstery_color", "red"] }),
      profileLayer("profile-upholstery-blue", 10, { eq: ["upholstery_color", "blue"] }),
      overheadLayer("overhead-base", 0, { eq: ["always", true] }),
    ]);

    const selectedLayers = selectActiveLayersByView({
      modelConfig,
      normalizedState: {
        always: true,
        upholstery_color: "red",
        stereo_package: "premium", // selected option without any layer
      },
    });

    expect(selectedLayers.profile?.map((layer) => layer.id)).toEqual([
      "profile-hull",
      "profile-upholstery-red",
    ]);
    expect(selectedLayers.overhead?.map((layer) => layer.id)).toEqual(["overhead-base"]);
  });

  it("activates conditional hardtop layers", () => {
    const modelConfig = createTestModelConfig([
      profileLayer("profile-boat", 0, { eq: ["always", true] }),
      profileLayer("profile-hardtop-on", 20, { eq: ["hardtop", true] }),
      profileLayer("profile-hardtop-off", 20, { eq: ["hardtop", false] }),
      overheadLayer("overhead-hardtop-on", 20, { eq: ["hardtop", true] }),
    ]);

    const withHardtop = selectActiveLayersByView({
      modelConfig,
      normalizedState: { always: true, hardtop: true },
    });

    const withoutHardtop = selectActiveLayersByView({
      modelConfig,
      normalizedState: { always: true, hardtop: false },
    });

    expect(withHardtop.profile?.map((layer) => layer.id)).toEqual([
      "profile-boat",
      "profile-hardtop-on",
    ]);
    expect(withHardtop.overhead?.map((layer) => layer.id)).toEqual(["overhead-hardtop-on"]);

    expect(withoutHardtop.profile?.map((layer) => layer.id)).toEqual([
      "profile-boat",
      "profile-hardtop-off",
    ]);
    expect(withoutHardtop.overhead?.map((layer) => layer.id)).toEqual([]);
  });

  it("selects hardtop frame color variants", () => {
    const modelConfig = createTestModelConfig([
      profileLayer("profile-boat", 0, { eq: ["always", true] }),
      profileLayer("profile-hardtop-frame-black", 30, {
        all: [
          { eq: ["hardtop", true] },
          { eq: ["hardtop_frame_color", "black"] },
        ],
      }),
      profileLayer("profile-hardtop-frame-white", 30, {
        all: [
          { eq: ["hardtop", true] },
          { eq: ["hardtop_frame_color", "white"] },
        ],
      }),
    ]);

    const selectedLayers = selectActiveLayersByView({
      modelConfig,
      normalizedState: {
        always: true,
        hardtop: true,
        hardtop_frame_color: "white",
      },
    });

    expect(selectedLayers.profile?.map((layer) => layer.id)).toEqual([
      "profile-boat",
      "profile-hardtop-frame-white",
    ]);
  });

  it("supports derived matching from computed rule values", () => {
    const modelConfig = createTestModelConfig([
      profileLayer("profile-boat", 0, { eq: ["always", true] }),
      profileLayer("profile-deck-covering-sand", 40, { eq: ["deck_covering_color", "sand"] }),
      profileLayer("profile-deck-covering-charcoal", 40, {
        eq: ["deck_covering_color", "charcoal"],
      }),
      overheadLayer("overhead-deck-covering-sand", 40, { eq: ["deck_covering_color", "sand"] }),
    ]);

    const selectedLayers = selectActiveLayersByView({
      modelConfig,
      normalizedState: {
        always: true,
        upholstery_color: "sand",
      },
      computedRuleResults: {
        derivedValues: {
          deck_covering_color: "sand",
        },
      },
    });

    expect(selectedLayers.profile?.map((layer) => layer.id)).toEqual([
      "profile-boat",
      "profile-deck-covering-sand",
    ]);
    expect(selectedLayers.overhead?.map((layer) => layer.id)).toEqual(["overhead-deck-covering-sand"]);
  });
});

function createTestModelConfig(layers: LayerDef[]): ModelConfig {
  return {
    meta: {
      clientId: "client-1",
      clientSlug: "client",
      modelId: "model-1",
      modelSlug: "model",
      modelVersionId: "version-1",
      versionLabel: "v1",
      publishedAtISO: "2026-01-01T00:00:00.000Z",
      currency: "USD",
    },
    branding: {},
    form: { steps: [] },
    rules: { rules: [] },
    pricing: {
      mode: "msrp",
      basePrice: { amount: 0, currency: "USD" },
    },
    rendering: {
      views: [
        {
          id: "profile",
          label: "Profile",
          width: 100,
          height: 50,
          layers: layers.filter((layer) => layer.viewId === "profile"),
        },
        {
          id: "overhead",
          label: "Overhead",
          width: 100,
          height: 50,
          layers: layers.filter((layer) => layer.viewId === "overhead"),
        },
      ],
    },
  };
}

function profileLayer(id: string, z: number, when: ConditionExpr): LayerDef {
  return createLayer(id, "profile", z, when);
}

function overheadLayer(id: string, z: number, when: ConditionExpr): LayerDef {
  return createLayer(id, "overhead", z, when);
}

function createLayer(id: string, viewId: ViewId, z: number, when: ConditionExpr): LayerDef {
  return {
    id,
    viewId,
    z,
    assetUrl: `https://assets.example/${id}.png`,
    when,
  };
}
