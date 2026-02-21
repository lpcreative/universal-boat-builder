import "server-only";

import { DirectusHttpClient } from "@ubb/cms-adapter-directus";
import { getModelVersionBundle } from "@ubb/cms-adapter-directus";
import { computePricing, type PricingLineItem, type PricingResult } from "@ubb/engine/pricing";
import type { SelectionState } from "../configurator-shared";
import { sanitizeSelectionState } from "../configurator-shared";
import { checkRequiredDirectusEnv, readRequiredDirectusWriteToken } from "./directus-env";

export type QuotePriceBook = "msrp" | "dealer";
export type QuoteViewMode = "paged" | "all";
export interface QuoteCustomerInfo {
  name: string;
  email: string;
  phone: string;
}

export interface QuoteCreateInput {
  modelVersionId: string;
  modelLabel: string | null;
  priceBook: QuotePriceBook;
  selections: SelectionState;
  encodedSelections: string | null;
  stepId: string | null;
  viewMode: QuoteViewMode;
  resumeUrl: string | null;
}

export interface QuoteCreateResult {
  id: string;
  quoteNumber: string | null;
}

export interface QuoteRecordView {
  id: string;
  quoteNumber: string | null;
  createdAt: string | null;
  channel: string | null;
  revision: string | null;
  totalsSnapshot: QuoteTotalsSnapshot | null;
  selectionsSnapshot: SelectionState;
  customerInfo: QuoteCustomerInfo;
}

export interface QuoteListItem {
  id: string;
  quoteNumber: string | null;
  createdAt: string | null;
  status: string | null;
  channel: string | null;
  customerInfo: QuoteCustomerInfo;
  modelLabel: string | null;
  totals: PricingResult["totals"] | null;
  priceBook: QuotePriceBook | null;
}

interface QuoteDirectusRecord {
  id: string;
  quote_number?: string | null;
  status?: string | null;
  date_created?: string | null;
  channel?: string | null;
  revision?: string | null;
  customer_info?: unknown;
  totals_snapshot?: unknown;
  selections_snapshot?: unknown;
}

interface QuoteListDirectusRecord {
  id: string;
  quote_number?: string | null;
  status?: string | null;
  date_created?: string | null;
  channel?: string | null;
  customer_info?: unknown;
  totals_snapshot?: unknown;
}

interface CreateQuoteDirectusResponse {
  id: string;
  quote_number?: string | null;
}

interface QuoteTotalsSnapshot {
  modelVersionId: string;
  modelLabel: string;
  priceBook: QuotePriceBook;
  totals: PricingResult["totals"];
  lineItems: Array<PricingLineItem & { unitPrice: number; extendedPrice: number }>;
  warnings: string[];
  meta: {
    encodedSelections: string | null;
    stepId: string | null;
    viewMode: QuoteViewMode;
    resumeUrl: string | null;
    createdAt: string;
  };
}

function buildQuoteNumber(now: Date): string {
  const datePart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const randomPart = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `Q-${datePart}-${randomPart}`;
}

function canonicalizeSelectionState(input: SelectionState): SelectionState {
  const sortedEntries = Object.entries(sanitizeSelectionState(input)).sort(([a], [b]) => a.localeCompare(b));
  const output: SelectionState = {};
  for (const [key, value] of sortedEntries) {
    if (Array.isArray(value)) {
      output[key] = [...value].sort((a, b) => a.localeCompare(b));
      continue;
    }
    output[key] = value;
  }
  return output;
}

function toLineItemSnapshot(lineItem: PricingLineItem, priceBook: QuotePriceBook): PricingLineItem & {
  unitPrice: number;
  extendedPrice: number;
} {
  const unitPrice = lineItem.isIncluded ? 0 : (priceBook === "dealer" ? lineItem.dealer ?? 0 : lineItem.msrp ?? 0);
  return {
    ...lineItem,
    unitPrice,
    extendedPrice: unitPrice * lineItem.qty
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCustomerInfo(value: unknown): QuoteCustomerInfo {
  if (!isObjectRecord(value)) {
    return {
      name: "",
      email: "",
      phone: ""
    };
  }
  return {
    name: typeof value.name === "string" ? value.name : "",
    email: typeof value.email === "string" ? value.email : "",
    phone: typeof value.phone === "string" ? value.phone : ""
  };
}

function normalizeCustomerInfo(input: Partial<QuoteCustomerInfo>): QuoteCustomerInfo {
  return {
    name: (input.name ?? "").trim(),
    email: (input.email ?? "").trim(),
    phone: (input.phone ?? "").trim()
  };
}

function createNoStoreClient(args: { baseUrl: string; token: string }): DirectusHttpClient {
  return new DirectusHttpClient({
    baseUrl: args.baseUrl,
    token: args.token,
    fetchImpl: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        cache: "no-store"
      })
  });
}

function parseTotalsSnapshot(value: unknown): QuoteTotalsSnapshot | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const modelVersionId = typeof value.modelVersionId === "string" ? value.modelVersionId : null;
  const modelLabel = typeof value.modelLabel === "string" ? value.modelLabel : null;
  const priceBook = value.priceBook === "dealer" ? "dealer" : value.priceBook === "msrp" ? "msrp" : null;
  const totals = isObjectRecord(value.totals) ? value.totals : null;
  const msrp = totals && typeof totals.msrp === "number" && Number.isFinite(totals.msrp) ? totals.msrp : 0;
  const dealer = totals && typeof totals.dealer === "number" && Number.isFinite(totals.dealer) ? totals.dealer : 0;
  const lineItems: QuoteTotalsSnapshot["lineItems"] = [];
  if (Array.isArray(value.lineItems)) {
    for (const rawLine of value.lineItems) {
      if (!isObjectRecord(rawLine)) {
        continue;
      }
      const key = typeof rawLine.key === "string" ? rawLine.key : "";
      const label = typeof rawLine.label === "string" ? rawLine.label : "";
      if (!key || !label) {
        continue;
      }
      const qty = typeof rawLine.qty === "number" && Number.isFinite(rawLine.qty) ? rawLine.qty : 0;
      const unitPrice =
        typeof rawLine.unitPrice === "number" && Number.isFinite(rawLine.unitPrice) ? rawLine.unitPrice : 0;
      const extendedPrice =
        typeof rawLine.extendedPrice === "number" && Number.isFinite(rawLine.extendedPrice)
          ? rawLine.extendedPrice
          : unitPrice * qty;

      lineItems.push({
        key,
        label,
        qty,
        isIncluded: rawLine.isIncluded === true,
        source: rawLine.source === "included" ? "included" : "selection",
        msrp: typeof rawLine.msrp === "number" ? rawLine.msrp : null,
        dealer: typeof rawLine.dealer === "number" ? rawLine.dealer : null,
        vendorCode: typeof rawLine.vendorCode === "string" ? rawLine.vendorCode : null,
        internalCode: typeof rawLine.internalCode === "string" ? rawLine.internalCode : null,
        notes: typeof rawLine.notes === "string" ? rawLine.notes : null,
        category: typeof rawLine.category === "string" ? rawLine.category : null,
        unitPrice,
        extendedPrice
      });
    }
  }
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const meta = isObjectRecord(value.meta) ? value.meta : {};
  const createdAt = typeof meta.createdAt === "string" ? meta.createdAt : new Date().toISOString();

  if (!modelVersionId || !modelLabel || !priceBook) {
    return null;
  }

  return {
    modelVersionId,
    modelLabel,
    priceBook,
    totals: {
      msrp,
      dealer
    },
    lineItems,
    warnings,
    meta: {
      encodedSelections: typeof meta.encodedSelections === "string" ? meta.encodedSelections : null,
      stepId: typeof meta.stepId === "string" ? meta.stepId : null,
      viewMode: meta.viewMode === "all" ? "all" : "paged",
      resumeUrl: typeof meta.resumeUrl === "string" ? meta.resumeUrl : null,
      createdAt
    }
  };
}

export async function createQuoteFromConfigurator(input: QuoteCreateInput): Promise<QuoteCreateResult> {
  const readEnv = checkRequiredDirectusEnv();
  if (!readEnv.ok) {
    throw new Error(`Missing Directus environment: ${readEnv.missing.join(", ")}`);
  }
  const writeToken = readRequiredDirectusWriteToken();

  const bundle = await getModelVersionBundle(input.modelVersionId);
  if (!bundle) {
    throw new Error(`No published model version bundle found for "${input.modelVersionId}".`);
  }

  const selections = canonicalizeSelectionState(input.selections);
  const pricing = computePricing(bundle, selections);
  const now = new Date();
  const quoteNumber = buildQuoteNumber(now);
  const modelLabel =
    input.modelLabel && input.modelLabel.length > 0 ? input.modelLabel : `${bundle.version_label ?? bundle.id}`;

  const totalsSnapshot: QuoteTotalsSnapshot = {
    modelVersionId: bundle.id,
    modelLabel,
    priceBook: input.priceBook,
    totals: pricing.totals,
    lineItems: pricing.lineItems.map((lineItem) => toLineItemSnapshot(lineItem, input.priceBook)),
    warnings: pricing.warnings,
    meta: {
      encodedSelections: input.encodedSelections,
      stepId: input.stepId,
      viewMode: input.viewMode,
      resumeUrl: input.resumeUrl,
      createdAt: now.toISOString()
    }
  };

  const client = createNoStoreClient({
    baseUrl: readEnv.apiUrl,
    token: writeToken
  });

  const created = await client.request<CreateQuoteDirectusResponse, Record<string, unknown>>({
    method: "POST",
    path: "/items/quotes",
    body: {
      status: "draft",
      revision: bundle.published_revision ?? null,
      quote_number: quoteNumber,
      channel: "web",
      customer_info: {},
      dealer: null,
      totals_snapshot: totalsSnapshot,
      selections_snapshot: selections
    }
  });

  return {
    id: created.id,
    quoteNumber: created.quote_number ?? quoteNumber
  };
}

export async function getQuoteById(quoteId: string): Promise<QuoteRecordView | null> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    throw new Error(`Missing Directus environment: ${env.missing.join(", ")}`);
  }
  const writeToken = readRequiredDirectusWriteToken();

  const client = createNoStoreClient({
    baseUrl: env.apiUrl,
    token: writeToken
  });

  try {
    const quote = await client.request<QuoteDirectusRecord>({
      path: `/items/quotes/${encodeURIComponent(quoteId)}`,
      query: {
        fields: "id,quote_number,status,date_created,channel,revision,customer_info,totals_snapshot,selections_snapshot"
      }
    });

    return {
      id: quote.id,
      quoteNumber: quote.quote_number ?? null,
      createdAt: quote.date_created ?? null,
      channel: quote.channel ?? null,
      revision: quote.revision ?? null,
      customerInfo: parseCustomerInfo(quote.customer_info),
      totalsSnapshot: parseTotalsSnapshot(quote.totals_snapshot),
      selectionsSnapshot: sanitizeSelectionState(quote.selections_snapshot)
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("-> 404")) {
      return null;
    }
    throw error;
  }
}

export async function listQuotes(args: { limit: number }): Promise<QuoteListItem[]> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    throw new Error(`Missing Directus environment: ${env.missing.join(", ")}`);
  }
  const writeToken = readRequiredDirectusWriteToken();

  const client = createNoStoreClient({
    baseUrl: env.apiUrl,
    token: writeToken
  });

  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(100, Math.floor(args.limit))) : 25;
  const rows = await client.request<QuoteListDirectusRecord[]>({
    path: "/items/quotes",
    query: {
      fields: "id,quote_number,status,date_created,channel,customer_info,totals_snapshot",
      sort: "-date_created",
      limit
    }
  });

  return rows.map((row) => {
    const parsedSnapshot = parseTotalsSnapshot(row.totals_snapshot);
    return {
      id: row.id,
      quoteNumber: row.quote_number ?? null,
      createdAt: row.date_created ?? null,
      status: row.status ?? null,
      channel: row.channel ?? null,
      customerInfo: parseCustomerInfo(row.customer_info),
      modelLabel: parsedSnapshot?.modelLabel ?? null,
      totals: parsedSnapshot?.totals ?? null,
      priceBook: parsedSnapshot?.priceBook ?? null
    };
  });
}

export async function updateQuoteCustomerInfo(args: {
  quoteId: string;
  customerInfo: Partial<QuoteCustomerInfo>;
}): Promise<QuoteCustomerInfo> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    throw new Error(`Missing Directus environment: ${env.missing.join(", ")}`);
  }
  const writeToken = readRequiredDirectusWriteToken();

  const client = createNoStoreClient({
    baseUrl: env.apiUrl,
    token: writeToken
  });

  const customerInfo = normalizeCustomerInfo(args.customerInfo);
  const updated = await client.request<QuoteDirectusRecord, Record<string, unknown>>({
    method: "PATCH",
    path: `/items/quotes/${encodeURIComponent(args.quoteId)}`,
    body: {
      customer_info: customerInfo
    }
  });

  return parseCustomerInfo(updated.customer_info);
}
