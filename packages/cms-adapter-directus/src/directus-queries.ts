import { readItems } from "@directus/sdk";
import { directusClient } from "./directus-client.js";
import type { ModelVersionBundle, PublishedModel } from "./directus-schema.js";

export async function getPublishedModels(): Promise<PublishedModel[]> {
  const models = await directusClient.request(
    readItems("boat_models", {
      filter: {
        is_active: { _eq: true },
        model_versions: {
          _some: {
            status: { _eq: "published" }
          }
        }
      },
      fields: [
        "id",
        "manufacturer_id",
        "slug",
        "name",
        "is_active",
        {
          model_versions: [
            "id",
            "manufacturer_id",
            "model_id",
            "model_slug",
            "version_label",
            "status",
            "published_at"
          ]
        }
      ],
      deep: {
        model_versions: {
          _filter: {
            status: { _eq: "published" }
          },
          _sort: ["-published_at", "-id"]
        }
      },
      sort: ["name", "id"]
    })
  );

  return (models as PublishedModel[]).map((model) => ({
    ...model,
    model_versions: model.model_versions ?? []
  }));
}

export async function getModelVersionBundle(modelVersionId: string): Promise<ModelVersionBundle | null> {
  const versions = await directusClient.request(
    readItems("model_versions", {
      filter: {
        id: { _eq: modelVersionId },
        status: { _eq: "published" }
      },
      limit: 1,
      fields: [
        "id",
        "manufacturer_id",
        "model_id",
        "model_slug",
        "version_label",
        "status",
        "published_at",
        {
          option_groups: [
            "id",
            "model_version_id",
            "key",
            "label",
            "sort",
            {
              questions: [
                "id",
                "option_group_id",
                "key",
                "label",
                "input_type",
                "sort",
                {
                  options: ["id", "question_id", "key", "label", "sort"]
                }
              ]
            }
          ]
        },
        {
          render_views: [
            "id",
            "model_version_id",
            "key",
            "label",
            "sort",
            {
              layers: [
                "id",
                "render_view_id",
                "key",
                "sort",
                "blend_mode",
                "opacity",
                {
                  layer_assets: ["id", "layer_id", "asset_role", "sort", "file"]
                },
                {
                  color_areas: [
                    "id",
                    "layer_id",
                    "key",
                    "sort",
                    "mask_file",
                    {
                      color_selections: [
                        "id",
                        "color_area_id",
                        "sort",
                        {
                          color: ["id", "color_palette_id", "name", "hex", "sort"]
                        },
                        {
                          option: ["id", "question_id", "key", "label", "sort"]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          color_palettes: [
            "id",
            "model_version_id",
            "key",
            "label",
            "sort",
            {
              colors: ["id", "color_palette_id", "name", "hex", "sort"]
            }
          ]
        },
        {
          rules: ["id", "model_version_id", "scope", "priority", "enabled", "rule_json"]
        }
      ],
      deep: {
        option_groups: {
          _sort: ["sort", "id"],
          questions: {
            _sort: ["sort", "id"],
            options: {
              _sort: ["sort", "id"]
            }
          }
        },
        render_views: {
          _sort: ["sort", "id"],
          layers: {
            _sort: ["sort", "id"],
            layer_assets: {
              _sort: ["sort", "id"]
            },
            color_areas: {
              _sort: ["sort", "id"],
              color_selections: {
                _sort: ["sort", "id"]
              }
            }
          }
        },
        color_palettes: {
          _sort: ["sort", "id"],
          colors: {
            _sort: ["sort", "id"]
          }
        },
        rules: {
          _sort: ["priority", "id"]
        }
      }
    })
  );

  const version = versions[0] as ModelVersionBundle | undefined;
  if (!version) {
    return null;
  }

  return {
    ...version,
    option_groups: version.option_groups ?? [],
    render_views: version.render_views ?? [],
    color_palettes: version.color_palettes ?? [],
    rules: version.rules ?? []
  };
}
