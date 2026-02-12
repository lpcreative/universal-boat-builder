import { describe, expect, it } from "vitest";
import type { ModelConfig } from "./model-config.js";
import { computePricingLineItems } from "./pricing.js";

const baseConfig = (): ModelConfig => ({
  meta: {
    clientId: "client-1",
    clientSlug: "client",
    modelId: "model-1",
    modelSlug: "boat",
    modelVersionId: "mv-1",
    versionLabel: "v1",
    publishedAtISO: "2026-01-01T00:00:00.000Z",
    currency: "USD"
  },
  branding: {},
  form: {
    steps: [
      {
        id: "step-1",
        title: "Configure",
        order: 1,
        sections: [
          {
            id: "section-1",
            title: "General",
            order: 1,
            fields: [
              {
                id: "trim",
                type: "single_select",
                label: "Trim",
                order: 1,
                options: [
                  { id: "sport", label: "Sport", price: { amount: 1000, currency: "USD" } },
                  { id: "lux", label: "Luxury", price: { amount: 2000, currency: "USD" } }
                ]
              },
              {
                id: "addon_toggle",
                type: "toggle",
                label: "Add-on",
                order: 2,
                options: [{ id: "addon", label: "Add-on", price: { amount: 300, currency: "USD" } }]
              },
              {
                id: "qty_acc",
                type: "multi_select",
                label: "Accessories",
                order: 3,
                options: [{ id: "rod_holder", label: "Rod Holder", price: { amount: 50, currency: "USD" } }]
              },
              {
                id: "pkg",
                type: "package_select",
                label: "Package",
                order: 4,
                options: [{ id: "fish_pkg", label: "Fishing Package" }]
              },
              {
                id: "electronics",
                type: "multi_select",
                label: "Electronics",
                order: 5,
                options: [
                  { id: "fishfinder", label: "Fish Finder", price: { amount: 400, currency: "USD" } },
                  { id: "chartplotter", label: "Chart Plotter", price: { amount: 900, currency: "USD" } }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  rules: {
    rules: []
  },
  pricing: {
    mode: "both",
    basePrice: { amount: 10000, currency: "USD" },
    packages: [
      {
        id: "fish_pkg",
        label: "Fishing Package",
        price: { amount: 1200, currency: "USD" },
        includes: [{ fieldId: "electronics", optionId: "fishfinder" }]
      }
    ]
  },
  rendering: {
    views: []
  }
});

describe("computePricingLineItems", () => {
  it("computes base + selected options totals", () => {
    const result = computePricingLineItems({
      modelConfig: baseConfig(),
      normalizedState: {
        trim: "sport",
        addon_toggle: true
      }
    });

    expect(result.totals).toEqual({ msrp: 11300, dealer: 11300 });
    expect(result.lineItems.map((item) => item.id)).toEqual([
      "base_price",
      "option:trim:sport",
      "option:addon_toggle:addon"
    ]);
  });

  it("supports quantity-based option totals", () => {
    const result = computePricingLineItems({
      modelConfig: baseConfig(),
      normalizedState: {
        qty_acc: { rod_holder: 3 }
      }
    });

    const qtyLine = result.lineItems.find((item) => item.id === "option:qty_acc:rod_holder");
    expect(qtyLine).toBeDefined();
    expect(qtyLine?.quantity).toBe(3);
    expect(qtyLine?.totals).toEqual({ msrp: 150, dealer: 150 });
    expect(result.totals).toEqual({ msrp: 10150, dealer: 10150 });
  });

  it("flags package-included options and prices them at zero", () => {
    const result = computePricingLineItems({
      modelConfig: baseConfig(),
      normalizedState: {
        pkg: "fish_pkg",
        electronics: ["chartplotter"]
      }
    });

    const included = result.lineItems.find((item) => item.id === "option:electronics:fishfinder");
    const extra = result.lineItems.find((item) => item.id === "option:electronics:chartplotter");

    expect(included?.included).toBe(true);
    expect(included?.includedByPackageId).toBe("fish_pkg");
    expect(included?.totals).toEqual({ msrp: 0, dealer: 0 });

    expect(extra?.included).toBeFalsy();
    expect(extra?.totals).toEqual({ msrp: 900, dealer: 900 });

    expect(result.totals).toEqual({ msrp: 12100, dealer: 12100 });
  });

  it("adds conditional surcharge line items from computed rule results", () => {
    const result = computePricingLineItems({
      modelConfig: baseConfig(),
      normalizedState: {},
      computedRuleResults: {
        addedLineItems: [
          {
            id: "rigging_surcharge",
            label: "Rigging Surcharge",
            amount: { amount: 275, currency: "USD" },
            category: "rigging"
          }
        ]
      }
    });

    const surcharge = result.lineItems.find((item) => item.id === "rule:rigging_surcharge");
    expect(surcharge?.source).toBe("rule_surcharge");
    expect(surcharge?.totals).toEqual({ msrp: 275, dealer: 275 });
    expect(result.totals).toEqual({ msrp: 10275, dealer: 10275 });
  });
});
