import { describe, expect, it } from "vitest";
import type { ModelConfig } from "./model-config.js";
import { computePricingLineItems } from "./pricing.js";

describe("computePricingLineItems", () => {
  it("computes separate MSRP and dealer totals", () => {
    const config: ModelConfig = {
      meta: {
        clientId: "client-1",
        clientSlug: "acme",
        modelId: "model-1",
        modelSlug: "falcon-24",
        modelVersionId: "mv-2026-v1",
        versionLabel: "2026 v1",
        publishedAtISO: "2026-01-10T00:00:00.000Z",
      },
      branding: {},
      form: {
        steps: [
          {
            id: "step-1",
            title: "Build",
            order: 1,
            sections: [
              {
                id: "section-1",
                title: "Options",
                order: 1,
                fields: [
                  {
                    id: "trailer",
                    type: "single_select",
                    label: "Trailer",
                    order: 1,
                    options: [
                      {
                        id: "trailer-tandem",
                        label: "Tandem Trailer",
                        price: { msrp: 5000, dealer: 4500 },
                      },
                    ],
                  },
                  {
                    id: "packages",
                    type: "package_select",
                    label: "Packages",
                    order: 2,
                    options: [{ id: "electronic-suite", label: "Electronic Suite" }],
                  },
                  {
                    id: "engine_type",
                    type: "single_select",
                    label: "Engine Type",
                    order: 3,
                    options: [
                      { id: "outboard", label: "Outboard" },
                      { id: "inboard", label: "Inboard" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      rules: { rules: [] },
      pricing: {
        mode: "both",
        basePrice: { msrp: 100000, dealer: 90000 },
        packages: [
          {
            id: "electronic-suite",
            label: "Electronic Suite",
            price: { msrp: 2000, dealer: 1500 },
          },
        ],
        lineItemRules: [
          {
            id: "outboard-rigging",
            priority: 10,
            when: { eq: ["engine_type", "outboard"] },
            addLineItems: [
              {
                id: "rigging",
                label: "Rigging Upgrade",
                amount: { msrp: 1200, dealer: 800 },
                quantity: 2,
                category: "rigging",
              },
            ],
          },
        ],
      },
      rendering: { views: [] },
    };

    const result = computePricingLineItems({
      config,
      state: {
        trailer: "trailer-tandem",
        packages: "electronic-suite",
        engine_type: "outboard",
      },
      manualAdjustments: {
        freight: 300,
        otherCharges: { msrp: 400, dealer: 250 },
      },
    });

    expect(result.lineItems.some((lineItem) => lineItem.id === "base-price")).toBe(true);
    expect(result.lineItems.some((lineItem) => lineItem.id === "manual:freight")).toBe(true);
    expect(result.lineItems.some((lineItem) => lineItem.id === "manual:other-charges")).toBe(true);
    expect(result.totals).toEqual({ msrp: 110100, dealer: 98150 });
    expect(result.totals.msrp).not.toBe(result.totals.dealer);
  });

  it("applies numeric manual adjustments equally to both books", () => {
    const config: ModelConfig = {
      meta: {
        clientId: "client-2",
        clientSlug: "acme",
        modelId: "model-2",
        modelSlug: "wave-20",
        modelVersionId: "mv-2026-v2",
        versionLabel: "2026 v2",
        publishedAtISO: "2026-01-10T00:00:00.000Z",
      },
      branding: {},
      form: { steps: [] },
      rules: { rules: [] },
      pricing: {
        mode: "both",
        basePrice: { msrp: 1000, dealer: 900 },
      },
      rendering: { views: [] },
    };

    const result = computePricingLineItems({
      config,
      state: {},
      manualAdjustments: {
        freight: 50,
      },
    });

    const freightLineItem = result.lineItems.find((lineItem) => lineItem.id === "manual:freight");
    expect(freightLineItem).toBeDefined();
    expect(freightLineItem?.msrp).toBe(50);
    expect(freightLineItem?.dealer).toBe(50);
    expect(result.totals).toEqual({ msrp: 1050, dealer: 950 });
  });
});
