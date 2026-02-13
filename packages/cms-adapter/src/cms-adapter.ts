import type {
  BoatModel,
  CreateSubmissionInput,
  Document,
  ListSubmissionsFilters,
  Manufacturer,
  ModelVersion,
  Submission
} from "./types.js";

export interface CmsAdapter {
  /**
   * Returns all active manufacturers that should be available in the public builder.
   */
  listManufacturers(): Promise<Manufacturer[]>;

  /**
   * Returns all active boat models for one manufacturer.
   *
   * @param manufacturerId - Canonical manufacturer ID.
   */
  listModels(manufacturerId: string): Promise<BoatModel[]>;

  /**
   * Resolves the currently published model version for a manufacturer + model slug pair.
   * Implementations should return `null` when no published version exists.
   *
   * @param opts - Model lookup parameters.
   */
  getPublishedModelVersion(opts: {
    manufacturerId: string;
    modelSlug: string;
  }): Promise<ModelVersion | null>;

  /**
   * Persists an immutable submission record that references the exact published model version
   * used during pricing/rendering.
   *
   * @param input - Submission payload including customer/dealer details, selections, and pricing snapshot.
   */
  createSubmission(input: CreateSubmissionInput): Promise<Submission>;

  /**
   * Lists submissions using optional server-side filters.
   *
   * @param filters - Optional filter criteria and pagination controls.
   */
  listSubmissions(filters?: ListSubmissionsFilters): Promise<Submission[]>;

  /**
   * Attaches an existing file/document asset to a submission and persists optional metadata.
   *
   * @param submissionId - Submission ID the document belongs to.
   * @param fileId - File identifier from the backing CMS/media library.
   * @param meta - Additional document metadata (for example: type, source, tags).
   */
  attachDocument(
    submissionId: string,
    fileId: string,
    meta?: Record<string, unknown>
  ): Promise<Document>;
}
