export interface Manufacturer {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface BoatModel {
  id: string;
  manufacturerId: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface ModelVersion {
  id: string;
  manufacturerId: string;
  modelId: string;
  modelSlug: string;
  versionLabel: string;
  status: "draft" | "published" | "archived";
  publishedAtISO: string | null;
  config: unknown;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface SubmissionItem {
  id: string;
  code?: string;
  label: string;
  quantity: number;
  unitAmount: number;
  lineTotalAmount: number;
  currency: string;
  category?: string;
}

export interface Submission {
  id: string;
  manufacturerId: string;
  modelId: string;
  modelVersionId: string;
  customer: Record<string, unknown>;
  dealer: Record<string, unknown> | null;
  selections: Record<string, unknown>;
  pricingSnapshot: {
    currency: string;
    subtotalAmount: number;
    totalAmount: number;
    items: SubmissionItem[];
    [key: string]: unknown;
  };
  stateSnapshot?: Record<string, unknown>;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface Document {
  id: string;
  submissionId: string;
  fileId: string;
  type?: string;
  title?: string;
  meta: Record<string, unknown>;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface ListSubmissionsFilters {
  manufacturerId?: string;
  modelId?: string;
  modelVersionId?: string;
  fromISO?: string;
  toISO?: string;
  limit?: number;
  offset?: number;
}

export interface CreateSubmissionInput {
  manufacturerId: string;
  modelId: string;
  modelVersionId: string;
  customer: Record<string, unknown>;
  dealer?: Record<string, unknown> | null;
  selections: Record<string, unknown>;
  pricingSnapshot: Submission["pricingSnapshot"];
}
