import "server-only";

import { getModelVersionBundle } from "@ubb/cms-adapter-directus";
import { computePricing, type PricingResult } from "@ubb/engine";
import type { SelectionState } from "../configurator-shared";
import { sanitizeSelectionState } from "../configurator-shared";
import { checkRequiredDirectusEnv } from "./directus-env";

export type QuotePriceBook = "msrp" | "dealer";
export type QuoteViewMode = "paged" | "all";

interface DirectusDataEnvelope<TData> {
  data: TData;
}

interface CreateDirectusQuoteInput {
  revision: string;
  quote_number: string;
  channel: string;
  customer_info: Record<string, unknown> | null;
  dealer: string | null;
  totals_snapshot: Record<string, unknown>;
  selections_snapshot: SelectionState;
}

interface DirectusQuoteRevisionModelVersion {
  id: string;
  year?: number | null;
  trim?: string | null;
  boat_model?: {
    id: string;
    name: string;
  } | null;
}

interface DirectusQuoteRevision {
  id: string;
  revision_number?: number | null;
  model_version?: DirectusQuoteRevisionModelVersion | null;
}

export interface DirectusQuoteRecord {
  id: string;
  quote_number: string;
  channel: string;
  customer_info: Record<string, unknown> | null;
  dealer: string | null;
  totals_snapshot: Record<string, unknown>;
  selections_snapshot: SelectionState;
  date_created: string | null;
  revision: DirectusQuoteRevision | string;
}

export interface CreateQuoteInput {
  modelVersionId: string;
  selections: SelectionState;
  priceBook: QuotePriceBook;
  channel?: string;
  customerInfo?: Record<string, unknown> | null;
  dealer?: string | null;
  activeStepId?: string | null;
  viewMode?: QuoteViewMode;
}

interface QuoteLineItemSnapshot {
  id: string;
  title: string;
  qty: number;
  unitPrice: number;
  extendedPrice: number;
  isIncluded: boolean;
}

export interface QuoteTotalsSnapshot {
  priceBook: QuotePriceBook;
  totals: {
    msrp: number;
    dealer: number;
    active: number;
  };
  lineItems: {
    selected: QuoteLineItemSnapshot[];
    included: QuoteLineItemSnapshot[];
  };
  warnings: string[];
  uiState: {
    activeStepId: string | null;
    viewMode: QuoteViewMode;
  };
}

function canonicalizeSelectionState(input: SelectionState): SelectionState {
  const sortedEntries = Object.entries(sanitizeSelectionState(input)).sort(([a], [b]) => a.localeCompare(b));
  const output: SelectionState = {};
  for (const [key, value] of sortedEntries) {
    if (Array.isArray(value)) {
      output[key] = [...value].sort((a, b) => a.localeCompare(b));
    } else {
      output[key] = value;
    }
  }
  return output;
}

function createQuoteNumber(now = new Date()): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const randomPart = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `Q-${yyyy}${mm}${dd}-${randomPart}`;
}

function pickUnitPrice(item: { msrp?: number | null; dealer?: number | null }, priceBook: QuotePriceBook): number {
  if (priceBook === "dealer") {
    return typeof item.dealer === "number" && Number.isFinite(item.dealer) ? item.dealer : 0;
  }
  return typeof item.msrp === "number" && Number.isFinite(item.msrp) ? item.msrp : 0;
}

function toLineItemSnapshot(
  line: { key: string; label: string; qty: number; isIncluded: boolean; msrp?: number | null; dealer?: number | null },
  priceBook: QuotePriceBook
): QuoteLineItemSnapshot {
  const unitPrice = line.isIncluded ? 0 : pickUnitPrice(line, priceBook);
  return {
    id: line.key,
    title: line.label,
    qty: line.qty,
    unitPrice,
    extendedPrice: unitPrice * line.qty,
    isIncluded: line.isIncluded
  };
}

function buildTotalsSnapshot(args: {
  priceBook: QuotePriceBook;
  activeStepId: string | null;
  viewMode: QuoteViewMode;
  pricing: PricingResult;
}): QuoteTotalsSnapshot {
  const selected = args.pricing.lineItems
    .filter((line): line is PricingResult["lineItems"][number] => line.source === "selection")
    .map((line) => toLineItemSnapshot(line, args.priceBook));
  const included = args.pricing.lineItems
    .filter((line): line is PricingResult["lineItems"][number] => line.source === "included")
    .map((line) => toLineItemSnapshot(line, args.priceBook));

  return {
    priceBook: args.priceBook,
    totals: {
      msrp: args.pricing.totals.msrp,
      dealer: args.pricing.totals.dealer,
      active: args.priceBook === "dealer" ? args.pricing.totals.dealer : args.pricing.totals.msrp
    },
    lineItems: {
      selected,
      included
    },
    warnings: args.pricing.warnings,
    uiState: {
      activeStepId: args.activeStepId,
      viewMode: args.viewMode
    }
  };
}

function buildFieldsQuery(fields: string[]): string {
  const params = new URLSearchParams();
  params.set("fields", fields.join(","));
  return params.toString();
}

async function directusPostQuote(input: CreateDirectusQuoteInput): Promise<{ id: string; quote_number: string }> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    throw new Error(`Missing env vars: ${env.missing.join(", ")}`);
  }

  const response = await fetch(`${env.apiUrl.replace(/\/+$/, "")}/items/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Failed to create quote: ${response.status} ${responseBody}`);
  }

  const payload = (await response.json()) as DirectusDataEnvelope<{ id: string; quote_number: string }>;
  return payload.data;
}

export async function getQuoteById(id: string): Promise<DirectusQuoteRecord | null> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    throw new Error(`Missing env vars: ${env.missing.join(", ")}`);
  }

  const query = buildFieldsQuery([
    "id",
    "quote_number",
    "channel",
    "customer_info",
    "dealer",
    "totals_snapshot",
    "selections_snapshot",
    "date_created",
    "revision.id",
    "revision.revision_number",
    "revision.model_version.id",
    "revision.model_version.year",
    "revision.model_version.trim",
    "revision.model_version.boat_model.id",
    "revision.model_version.boat_model.name"
  ]);

  const response = await fetch(`${env.apiUrl.replace(/\/+$/, "")}/items/quotes/${encodeURIComponent(id)}?${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.token}`
    },
    cache: "no-store"
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Failed to read quote: ${response.status} ${responseBody}`);
  }

  const payload = (await response.json()) as DirectusDataEnvelope<DirectusQuoteRecord>;
  if (!payload?.data?.id) {
    return null;
  }
  return {
    ...payload.data,
    selections_snapshot: sanitizeSelectionState(payload.data.selections_snapshot)
  };
}

export async function createQuote(input: CreateQuoteInput): Promise<{
  id: string;
  quoteNumber: string;
  totalsSnapshot: QuoteTotalsSnapshot;
  selectionsSnapshot: SelectionState;
}> {
  const bundle = await getModelVersionBundle(input.modelVersionId);
  if (!bundle) {
    throw new Error(`No published model version bundle found for "${input.modelVersionId}".`);
  }

  const revisionId = bundle.current_revision?.id ?? bundle.published_revision ?? null;
  if (!revisionId) {
    throw new Error("Cannot create quote: model version has no published revision.");
  }

  const selectionsSnapshot = canonicalizeSelectionState(input.selections);
  const pricing = computePricing(bundle, selectionsSnapshot);
  const priceBook: QuotePriceBook = input.priceBook === "dealer" ? "dealer" : "msrp";
  const totalsSnapshot = buildTotalsSnapshot({
    pricing,
    priceBook,
    activeStepId: input.activeStepId ?? null,
    viewMode: input.viewMode ?? "paged"
  });

  const quoteNumber = createQuoteNumber();
  const created = await directusPostQuote({
    revision: revisionId,
    quote_number: quoteNumber,
    channel: input.channel ?? "web",
    customer_info: input.customerInfo ?? null,
    dealer: input.dealer ?? null,
    totals_snapshot: totalsSnapshot as unknown as Record<string, unknown>,
    selections_snapshot: selectionsSnapshot
  });

  return {
    id: created.id,
    quoteNumber: created.quote_number,
    totalsSnapshot,
    selectionsSnapshot
  };
}
