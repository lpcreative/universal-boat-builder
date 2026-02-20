import { describe, expect, it } from "vitest";
import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";
import { computePricing, type PricingResult } from "./pricing.js";
import type { SelectionState } from "./selection-state.js";

function makeBundle(): ModelVersionBundle {
  return {
    id: "mv-1",
    boat_model: "boat-1",
    year: 2026,
    trim: "Sport",
    notes: null,
    published_revision: "rev-1",
    sort: 1,
    status: "published",
    model_year: 2026,
    version_label: "2026 Sport",
    published_at: "2026-01-01",
    current_revision: {
      id: "rev-1",
      model_version: "mv-1",
      revision_number: 1,
      effective_date: "2026-01-01",
      change_log: null,
      sort: 1,
      status: "published"
    },
    version_revisions: [],
    version_items: [
      {
        id: "vi-base",
        revision: "rev-1",
        item: "item-base",
        label_override: "Base Hull",
        msrp: 12000,
        dealer_price: 10000,
        is_available: true,
        is_included: false,
        is_default: true,
        sort: 1,
        item_detail: {
          id: "item-base",
          label_default: "Base Hull",
          item_category: "Hull",
          vendor_code: "V-BASE",
          internal_code: "I-BASE",
          sort: 1
        }
      },
      {
        id: "vi-qty",
        revision: "rev-1",
        item: "item-qty",
        label_override: "Rod Holder",
        msrp: 100,
        dealer_price: 80,
        is_available: true,
        is_included: false,
        is_default: false,
        sort: 2,
        item_detail: {
          id: "item-qty",
          label_default: "Rod Holder",
          item_category: "Accessories",
          sort: 2
        }
      },
      {
        id: "vi-included",
        revision: "rev-1",
        item: "item-included",
        label_override: "Standard Trailer",
        msrp: 800,
        dealer_price: 650,
        is_available: true,
        is_included: true,
        is_default: false,
        sort: 3,
        item_detail: {
          id: "item-included",
          label_default: "Standard Trailer",
          item_category: "Trailer",
          sort: 3
        }
      },
      {
        id: "vi-alpha",
        revision: "rev-1",
        item: "item-alpha",
        label_override: "Alpha",
        msrp: 50,
        dealer_price: 40,
        is_available: true,
        is_included: false,
        is_default: false,
        sort: 4,
        item_detail: {
          id: "item-alpha",
          label_default: "Alpha",
          item_category: "Accessories",
          sort: 4
        }
      },
      {
        id: "vi-beta",
        revision: "rev-1",
        item: "item-beta",
        label_override: "Beta",
        msrp: 30,
        dealer_price: 24,
        is_available: true,
        is_included: false,
        is_default: false,
        sort: 5,
        item_detail: {
          id: "item-beta",
          label_default: "Beta",
          item_category: "Accessories",
          sort: 5
        }
      },
      {
        id: "vi-ambiguous",
        revision: "rev-1",
        item: "item-ambiguous",
        label_override: "Ambiguous Included",
        msrp: null,
        dealer_price: null,
        is_available: true,
        is_included: true,
        is_default: false,
        sort: 6,
        item_detail: {
          id: "item-ambiguous",
          label_default: "Ambiguous Included",
          item_category: "Trailer",
          sort: 6
        }
      }
    ],
    flows: [],
    flow_steps: [],
    flow_sections: [],
    selection_groups: [
      {
        id: "group-single",
        section: "sec-1",
        key: "base_hull",
        title: "Base Hull",
        selection_mode: "single",
        sort: 1
      },
      {
        id: "group-qty",
        section: "sec-1",
        key: "rod_holders",
        title: "Rod Holders",
        selection_mode: "quantity",
        sort: 2
      },
      {
        id: "group-multi",
        section: "sec-1",
        key: "extras",
        title: "Extras",
        selection_mode: "multi",
        sort: 3
      }
    ],
    group_options: [
      {
        id: "go-base",
        selection_group: "group-single",
        version_item: "vi-base",
        sort: 1
      },
      {
        id: "go-qty",
        selection_group: "group-qty",
        version_item: "vi-qty",
        sort: 1
      },
      {
        id: "go-alpha",
        selection_group: "group-multi",
        version_item: "vi-alpha",
        sort: 1
      },
      {
        id: "go-beta",
        selection_group: "group-multi",
        version_item: "vi-beta",
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

function compute(args: { selections: SelectionState; mutate?: (bundle: ModelVersionBundle) => void }): PricingResult {
  const bundle = makeBundle();
  args.mutate?.(bundle);
  return computePricing(bundle, args.selections);
}

describe("computePricing", () => {
  it("orders line items deterministically by category, label, then key", () => {
    const firstRun = compute({
      selections: {
        base_hull: "vi-base",
        extras: ["vi-beta", "vi-alpha"]
      }
    });
    const secondRun = compute({
      selections: {
        base_hull: "vi-base",
        extras: ["vi-alpha", "vi-beta"]
      },
      mutate: (bundle) => {
        bundle.group_options.reverse();
        bundle.version_items.reverse();
      }
    });

    expect(firstRun.lineItems.map((item) => item.key)).toEqual(secondRun.lineItems.map((item) => item.key));
  });

  it("multiplies totals and quantity for quantity groups", () => {
    const result = compute({
      selections: {
        rod_holders: 3
      }
    });

    const qtyItem = result.lineItems.find((item) => item.key.startsWith("rod_holders:vi-qty"));
    expect(qtyItem?.qty).toBe(3);
    expect(result.totals.msrp).toBe(1100);
    expect(result.totals.dealer).toBe(890);
  });

  it("includes included items in line items and totals with ambiguity warning when price is missing", () => {
    const result = compute({
      selections: {}
    });

    const included = result.lineItems.filter((item) => item.source === "included");
    expect(included.map((item) => item.key)).toEqual(["included:vi-ambiguous", "included:vi-included"]);
    expect(result.totals.msrp).toBe(800);
    expect(result.totals.dealer).toBe(650);
    expect(result.warnings.some((warning) => warning.includes("vi-ambiguous"))).toBe(true);
  });

  it("applies group option price overrides when present", () => {
    const result = compute({
      selections: {
        base_hull: "vi-base"
      },
      mutate: (bundle) => {
        bundle.group_options[0] = {
          ...bundle.group_options[0],
          override_msrp: 9999,
          override_dealer_price: 7777
        };
      }
    });

    const lineItem = result.lineItems.find((item) => item.key.startsWith("base_hull:vi-base"));
    expect(lineItem?.msrp).toBe(9999);
    expect(lineItem?.dealer).toBe(7777);
  });
});
