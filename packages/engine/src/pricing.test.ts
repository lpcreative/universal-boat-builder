import { describe, expect, it } from "vitest";
import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";
import { computePricing } from "./pricing.js";

type SelectionState = Record<string, string | string[] | boolean | number | null>;

function makeBundle(): ModelVersionBundle {
  return {
    id: "mv-1",
    boat_model: "bm-1",
    year: 2026,
    trim: "Test",
    notes: null,
    published_revision: "rev-1",
    sort: 1,
    status: "published",
    model_year: 2026,
    version_label: "2026 Test",
    published_at: "2026-01-01",
    current_revision: null,
    version_revisions: [],
    version_items: [
      {
        id: "vi-engine",
        revision: "rev-1",
        item: "item-engine",
        msrp: 1000,
        dealer_price: 900,
        is_available: true,
        is_default: true,
        is_included: false,
        sort: 1,
        item_detail: { id: "item-engine", label_default: "Engine", sort: 1 }
      },
      {
        id: "vi-seat",
        revision: "rev-1",
        item: "item-seat",
        msrp: 500,
        dealer_price: 450,
        is_available: true,
        is_default: false,
        is_included: true,
        sort: 2,
        item_detail: { id: "item-seat", label_default: "Seat Package", sort: 2 }
      }
    ],
    flows: [],
    flow_steps: [],
    flow_sections: [],
    selection_groups: [
      {
        id: "group-single",
        section: "section-1",
        key: "engine",
        title: "Engine",
        selection_mode: "single",
        sort: 1
      },
      {
        id: "group-qty",
        section: "section-1",
        key: "seat_qty",
        title: "Seats",
        selection_mode: "quantity",
        sort: 2
      }
    ],
    group_options: [
      {
        id: "go-engine",
        selection_group: "group-single",
        version_item: "vi-engine",
        sort: 1
      },
      {
        id: "go-seat",
        selection_group: "group-qty",
        version_item: "vi-seat",
        sort: 2
      }
    ],
    color_areas: [],
    color_palettes: [],
    color_palette_items: [],
    render_views: [],
    render_layers: []
  };
}

describe("computePricing", () => {
  it("computes totals from selected non-included items and emits included lines", () => {
    const bundle = makeBundle();
    const selections: SelectionState = {
      engine: "vi-engine",
      seat_qty: 2
    };

    const result = computePricing(bundle, selections);

    expect(result.totals.msrp).toBe(1000);
    expect(result.totals.dealer).toBe(900);
    expect(result.lineItems.find((line) => line.label === "Engine")?.msrp).toBe(1000);
    expect(result.lineItems.find((line) => line.label === "Engine")?.isIncluded).toBe(false);
    expect(result.lineItems.find((line) => line.label === "Seat Package")?.isIncluded).toBe(true);
    expect(result.lineItems.find((line) => line.label === "Seat Package")?.msrp).toBe(0);
  });

  it("adds a warning when priced selections still produce zero totals", () => {
    const bundle = makeBundle();
    bundle.version_items[0] = {
      ...bundle.version_items[0],
      is_included: true
    };
    const selections: SelectionState = { engine: "vi-engine" };

    const result = computePricing(bundle, selections);

    expect(result.totals.msrp).toBe(0);
    expect(result.warnings.some((warning) => warning.includes("computed totals are zero"))).toBe(true);
  });
});
