import {
  getModelVersionBundle as queryGetModelVersionBundle,
  getPublishedModels as queryGetPublishedModels
} from "./directus-queries.js";
import type { ModelVersionBundle, PublishedModel } from "./directus-schema.js";

export async function getModelVersionBundle(modelVersionId: string): Promise<ModelVersionBundle | null> {
  return queryGetModelVersionBundle(modelVersionId);
}

export async function getPublishedModels(): Promise<PublishedModel[]> {
  return queryGetPublishedModels();
}
