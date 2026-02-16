import { describe, expect, it } from "vitest";
import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";
import { collectTintLayerWarnings, createDeterministicSelectionState } from "./configurator-session.js";

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
        id: "vi-default",
        revision: "rev-1",
        item: "item-default",
        is_available: true,
        is_default: true,
        sort: 1,
        item_detail: {
          id: "item-default",
          label_default: "Default",
          color_hex: "#111111",
          sort: 1
        }
      },
      {
        id: "vi-alt",
        revision: "rev-1",
        item: "item-alt",
        is_available: true,
        is_default: false,
        sort: 2,
        item_detail: {
          id: "item-alt",
          label_default: "Alt",
          color_hex: "#222222",
          sort: 2
        }
      },
      {
        id: "vi-multi-a",
        revision: "rev-1",
        item: "item-multi-a",
        is_available: true,
        is_default: true,
        sort: 3,
        item_detail: {
          id: "item-multi-a",
          label_default: "Multi A",
          sort: 3
        }
      },
      {
        id: "vi-multi-b",
        revision: "rev-1",
        item: "item-multi-b",
        is_available: true,
        is_default: true,
        sort: 4,
        item_detail: {
          id: "item-multi-b",
          label_default: "Multi B",
          sort: 4
        }
      }
    ],
    flows: [],
    flow_steps: [],
    flow_sections: [],
    selection_groups: [
      {
        id: "group-single",
        section: "section-1",
        key: "single_group",
        title: "Single Group",
        selection_mode: "single",
        color_area: "area-hull",
        color_palette: "palette-1",
        sort: 1
      },
      {
        id: "group-multi",
        section: "section-1",
        key: "multi_group",
        title: "Multi Group",
        selection_mode: "multi",
        sort: 2
      },
      {
        id: "group-boolean",
        section: "section-1",
        key: "bool_group",
        title: "Boolean Group",
        selection_mode: "boolean",
        sort: 3
      },
      {
        id: "group-quantity",
        section: "section-1",
        key: "qty_group",
        title: "Quantity Group",
        selection_mode: "quantity",
        sort: 4
      }
    ],
    group_options: [
      {
        id: "go-single-default",
        selection_group: "group-single",
        version_item: "vi-default",
        default_state: "inherit",
        sort: 1
      },
      {
        id: "go-single-alt",
        selection_group: "group-single",
        version_item: "vi-alt",
        default_state: "inherit",
        sort: 2
      },
      {
        id: "go-multi-a",
        selection_group: "group-multi",
        version_item: "vi-multi-a",
        default_state: "inherit",
        sort: 1
      },
      {
        id: "go-multi-b",
        selection_group: "group-multi",
        version_item: "vi-multi-b",
        default_state: "inherit",
        sort: 2
      },
      {
        id: "go-boolean-true",
        selection_group: "group-boolean",
        version_item: "vi-default",
        default_state: "selected",
        sort: 1
      },
      {
        id: "go-quantity-default",
        selection_group: "group-quantity",
        version_item: "vi-default",
        default_state: "selected",
        sort: 1
      }
    ],
    color_areas: [{ id: "area-hull", key: "hull", title: "Hull", sort: 1 }],
    color_palettes: [{ id: "palette-1", revision: "rev-1", key: "hull-palette", title: "Hull Palette", sort: 1 }],
    color_palette_items: [
      {
        id: "cpi-1",
        color_palette: "palette-1",
        item: "item-default",
        sort: 1,
        item_detail: {
          id: "item-default",
          label_default: "Default",
          color_hex: "#111111",
          sort: 1
        }
      }
    ],
    render_views: [{ id: "view-1", revision: "rev-1", key: "hero", title: "Hero", sort: 1 }],
    render_layers: [
      {
        id: "layer-base",
        render_view: "view-1",
        key: "base",
        layer_type: "image",
        asset: "asset-base",
        sort: 1
      },
      {
        id: "layer-tint",
        render_view: "view-1",
        key: "hull-tint",
        layer_type: "tint",
        asset: "asset-base",
        mask_asset: "asset-mask",
        color_area: "area-hull",
        sort: 2
      }
    ]
  };
}

describe("createDeterministicSelectionState", () => {
  it("builds deterministic defaults across selection modes", () => {
    const bundle = makeBundle();

    const result = createDeterministicSelectionState(bundle);

    expect(result.selections.single_group).toBe("vi-default");
    expect(result.selections.multi_group).toEqual(["vi-multi-a", "vi-multi-b"]);
    expect(result.selections.bool_group).toBe(true);
    expect(result.selections.qty_group).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("adds warning when a palette cannot resolve to an available version item", () => {
    const bundle = makeBundle();
    bundle.selection_groups[0] = {
      ...bundle.selection_groups[0],
      key: "broken_palette_group",
      color_palette: "palette-missing"
    };

    const result = createDeterministicSelectionState(bundle);

    expect(result.selections.broken_palette_group).toBe("vi-default");
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("broken_palette_group");
  });
});

describe("collectTintLayerWarnings", () => {
  it("warns when tint layer color_area has no matching selection group", () => {
    const bundle = makeBundle();
    bundle.render_layers[1] = {
      ...bundle.render_layers[1],
      color_area: "area-deck"
    };

    const warnings = collectTintLayerWarnings(bundle);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("hull-tint");
    expect(warnings[0]).toContain("area-deck");
  });
});
