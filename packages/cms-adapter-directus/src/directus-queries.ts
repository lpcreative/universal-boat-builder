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
        "slug",
        "name",
        "is_active",
        {
          model_versions: ["id", "version_label", "status", "published_at"]
        }
      ],
      deep: {
        model_versions: {
          _filter: {
            status: { _eq: "published" }
          },
          _sort: ["-published_at"]
        }
      },
      sort: ["name"]
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
        "model_id",
        "version_label",
        "status",
        "published_at",
        {
          option_groups: [
            "id",
            "key",
            "label",
            "sort",
            {
              questions: [
                "id",
                "key",
                "label",
                "input_type",
                "sort",
                {
                  options: ["id", "key", "label", "sort"]
                }
              ]
            }
          ]
        },
        {
          render_views: [
            "id",
            "key",
            "label",
            "sort",
            {
              layers: [
                "id",
                "key",
                "sort",
                "blend_mode",
                "opacity",
                {
                  layer_assets: ["id", "asset_role", "sort", "file"]
                },
                {
                  color_areas: [
                    "id",
                    "key",
                    "sort",
                    "mask_file",
                    {
                      color_selections: [
                        "id",
                        "sort",
                        {
                          color: ["id", "name", "hex", "sort"]
                        },
                        {
                          option: ["id", "key", "label", "sort"]
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
            "key",
            "label",
            "sort",
            {
              colors: ["id", "name", "hex", "sort"]
            }
          ]
        },
        {
          rules: ["id", "scope", "priority", "enabled", "rule_json"]
        }
      ],
      deep: {
        option_groups: {
          _sort: ["sort"],
          questions: {
            _sort: ["sort"],
            options: {
              _sort: ["sort"]
            }
          }
        },
        render_views: {
          _sort: ["sort"],
          layers: {
            _sort: ["sort"],
            layer_assets: {
              _sort: ["sort"]
            },
            color_areas: {
              _sort: ["sort"],
              color_selections: {
                _sort: ["sort"]
              }
            }
          }
        },
        color_palettes: {
          _sort: ["sort"],
          colors: {
            _sort: ["sort"]
          }
        },
        rules: {
          _sort: ["priority"]
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
