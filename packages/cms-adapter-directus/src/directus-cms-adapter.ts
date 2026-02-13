import type {
  BoatModel,
  CmsAdapter,
  CreateSubmissionInput,
  Document,
  ListSubmissionsFilters,
  Manufacturer,
  ModelVersion,
  Submission
} from "@ubb/cms-adapter";
import { DirectusHttpClient, type DirectusHttpClientOptions } from "./http.js";

interface DirectusCollections {
  manufacturers: string;
  models: string;
  modelVersions: string;
  submissions: string;
  documents: string;
}

export interface DirectusCmsAdapterOptions {
  directusUrl?: string;
  directusToken?: string;
  collections?: Partial<DirectusCollections>;
  httpClient?: DirectusHttpClient;
  fetchImpl?: typeof fetch;
}

const DEFAULT_COLLECTIONS: DirectusCollections = {
  manufacturers: "manufacturers",
  models: "boat_models",
  modelVersions: "model_versions",
  submissions: "submissions",
  documents: "documents"
};

function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export class DirectusCmsAdapter implements CmsAdapter {
  private readonly client: DirectusHttpClient;
  private readonly collections: DirectusCollections;

  constructor(options: DirectusCmsAdapterOptions = {}) {
    this.collections = { ...DEFAULT_COLLECTIONS, ...options.collections };

    if (options.httpClient) {
      this.client = options.httpClient;
      return;
    }

    const directusUrl = required(options.directusUrl ?? readEnv("DIRECTUS_URL"), "DIRECTUS_URL");
    const directusToken = required(options.directusToken ?? readEnv("DIRECTUS_TOKEN"), "DIRECTUS_TOKEN");

    const clientOptions: DirectusHttpClientOptions = {
      baseUrl: directusUrl,
      token: directusToken,
      fetchImpl: options.fetchImpl
    };
    this.client = new DirectusHttpClient(clientOptions);
  }

  async listManufacturers(): Promise<Manufacturer[]> {
    return this.client.request<Manufacturer[]>({
      path: `/items/${this.collections.manufacturers}`,
      query: {
        filter: {
          isActive: { _eq: true }
        }
      }
    });
  }

  async listModels(manufacturerId: string): Promise<BoatModel[]> {
    return this.client.request<BoatModel[]>({
      path: `/items/${this.collections.models}`,
      query: {
        filter: {
          manufacturerId: { _eq: manufacturerId },
          isActive: { _eq: true }
        }
      }
    });
  }

  async getPublishedModelVersion(opts: {
    manufacturerId: string;
    modelSlug: string;
  }): Promise<ModelVersion | null> {
    const items = await this.client.request<ModelVersion[]>({
      path: `/items/${this.collections.modelVersions}`,
      query: {
        filter: {
          manufacturerId: { _eq: opts.manufacturerId },
          modelSlug: { _eq: opts.modelSlug },
          status: { _eq: "published" }
        },
        sort: "-publishedAtISO",
        limit: 1
      }
    });

    return items[0] ?? null;
  }

  async createSubmission(input: CreateSubmissionInput): Promise<Submission> {
    return this.client.request<Submission, CreateSubmissionInput>({
      method: "POST",
      path: `/items/${this.collections.submissions}`,
      body: input
    });
  }

  async listSubmissions(filters: ListSubmissionsFilters = {}): Promise<Submission[]> {
    const filter: Record<string, unknown> = {};

    if (filters.manufacturerId) {
      filter.manufacturerId = { _eq: filters.manufacturerId };
    }
    if (filters.modelId) {
      filter.modelId = { _eq: filters.modelId };
    }
    if (filters.modelVersionId) {
      filter.modelVersionId = { _eq: filters.modelVersionId };
    }
    if (filters.fromISO || filters.toISO) {
      const createdAtISO: Record<string, string> = {};
      if (filters.fromISO) {
        createdAtISO._gte = filters.fromISO;
      }
      if (filters.toISO) {
        createdAtISO._lte = filters.toISO;
      }
      filter.createdAtISO = createdAtISO;
    }

    return this.client.request<Submission[]>({
      path: `/items/${this.collections.submissions}`,
      query: {
        filter: Object.keys(filter).length ? filter : undefined,
        limit: filters.limit,
        offset: filters.offset,
        sort: "-createdAtISO"
      }
    });
  }

  async attachDocument(
    submissionId: string,
    fileId: string,
    meta: Record<string, unknown> = {}
  ): Promise<Document> {
    return this.client.request<Document, Omit<Document, "id" | "createdAtISO" | "updatedAtISO">>({
      method: "POST",
      path: `/items/${this.collections.documents}`,
      body: {
        submissionId,
        fileId,
        meta
      }
    });
  }
}
