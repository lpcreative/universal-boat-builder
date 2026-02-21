import "server-only";

import { DirectusHttpClient } from "@ubb/cms-adapter-directus";
import type { SelectionState } from "../configurator-shared";
import { sanitizeSelectionState } from "../configurator-shared";
import {
  ORDER_EVENT_TYPE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  type OrderEventType,
  type OrderStatus
} from "../orders-shared";
import { checkRequiredDirectusEnv, readRequiredDirectusWriteToken } from "./directus-env";
import { parseCustomerInfo, parseTotalsSnapshot, type QuoteCustomerInfo, type QuoteTotalsSnapshot } from "./quotes";

interface QuoteSourceRecord {
  id: string;
  quote_number?: string | null;
  dealer?: string | null;
  revision?: string | null;
  customer_info?: unknown;
  totals_snapshot?: unknown;
  selections_snapshot?: unknown;
}

interface OrderDirectusRecord {
  id: string;
  status?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  order_number?: string | null;
  dealer?: string | null;
  customer_info?: unknown;
  totals_snapshot?: unknown;
  selections_snapshot?: unknown;
  external_refs?: unknown;
}

interface OrderEventDirectusRecord {
  id: string;
  type?: string | null;
  note?: string | null;
  date_created?: string | null;
}

interface CreateOrderDirectusResponse {
  id: string;
  order_number?: string | null;
}

interface ExternalRefs {
  source?: string;
  quote_id?: string;
}

export interface OrderEventView {
  id: string;
  type: string | null;
  note: string | null;
  createdAt: string | null;
}

export interface OrderListItem {
  id: string;
  orderNumber: string | null;
  status: string | null;
  createdAt: string | null;
  dealerId: string | null;
  customerInfo: QuoteCustomerInfo;
  totalsSnapshot: QuoteTotalsSnapshot | null;
}

export interface OrderRecordView {
  id: string;
  orderNumber: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  dealerId: string | null;
  customerInfo: QuoteCustomerInfo;
  totalsSnapshot: QuoteTotalsSnapshot | null;
  selectionsSnapshot: SelectionState;
  externalRefs: ExternalRefs;
  events: OrderEventView[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseExternalRefs(value: unknown): ExternalRefs {
  if (!isRecord(value)) {
    return {};
  }
  return {
    source: typeof value.source === "string" ? value.source : undefined,
    quote_id: typeof value.quote_id === "string" ? value.quote_id : undefined
  };
}

function buildOrderNumber(now: Date): string {
  const datePart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
  return `ORD-${datePart}-${randomPart}`;
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

function pickEventType(preferred: OrderEventType): OrderEventType {
  if (ORDER_EVENT_TYPE_OPTIONS.includes(preferred)) {
    return preferred;
  }
  return "other";
}

function mapOrderListItem(record: OrderDirectusRecord): OrderListItem {
  return {
    id: record.id,
    orderNumber: record.order_number ?? null,
    status: record.status ?? null,
    createdAt: record.date_created ?? null,
    dealerId: typeof record.dealer === "string" ? record.dealer : null,
    customerInfo: parseCustomerInfo(record.customer_info),
    totalsSnapshot: parseTotalsSnapshot(record.totals_snapshot)
  };
}

function requiredClient(): { client: DirectusHttpClient } {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    throw new Error(`Missing Directus environment: ${env.missing.join(", ")}`);
  }
  const writeToken = readRequiredDirectusWriteToken();
  return {
    client: createNoStoreClient({ baseUrl: env.apiUrl, token: writeToken })
  };
}

export async function createOrderFromQuote(args: { quoteId: string }): Promise<{ orderId: string; orderNumber: string }> {
  const { client } = requiredClient();
  const quoteId = args.quoteId.trim();
  if (!quoteId) {
    throw new Error("quoteId is required");
  }

  const quote = await client.request<QuoteSourceRecord>({
    path: `/items/quotes/${encodeURIComponent(quoteId)}`,
    query: {
      fields: "id,quote_number,dealer,revision,customer_info,totals_snapshot,selections_snapshot"
    }
  });

  if (!quote.totals_snapshot || !quote.selections_snapshot) {
    throw new Error("Quote is missing required snapshot data");
  }

  const now = new Date();
  const orderNumber = buildOrderNumber(now);
  const created = await client.request<CreateOrderDirectusResponse, Record<string, unknown>>({
    method: "POST",
    path: "/items/orders",
    body: {
      status: "draft",
      revision: quote.revision ?? null,
      order_number: orderNumber,
      dealer: typeof quote.dealer === "string" ? quote.dealer : null,
      customer_info: isRecord(quote.customer_info) ? quote.customer_info : {},
      totals_snapshot: quote.totals_snapshot,
      selections_snapshot: quote.selections_snapshot,
      external_refs: {
        source: "quote",
        quote_id: quote.id
      }
    }
  });

  await client.request<OrderEventDirectusRecord, Record<string, unknown>>({
    method: "POST",
    path: "/items/order_events",
    body: {
      order: created.id,
      type: pickEventType("order_created"),
      note: `Converted from quote ${quote.quote_number ?? quote.id}`
    }
  });

  return {
    orderId: created.id,
    orderNumber: created.order_number ?? orderNumber
  };
}

export async function listOrders(args: { limit: number }): Promise<OrderListItem[]> {
  const { client } = requiredClient();
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(100, Math.floor(args.limit))) : 25;
  const records = await client.request<OrderDirectusRecord[]>({
    path: "/items/orders",
    query: {
      fields: "id,status,date_created,order_number,dealer,customer_info,totals_snapshot",
      sort: "-date_created",
      limit
    }
  });

  return records.map((record) => mapOrderListItem(record));
}

export async function getOrderById(orderId: string): Promise<OrderRecordView | null> {
  const { client } = requiredClient();
  try {
    const order = await client.request<OrderDirectusRecord>({
      path: `/items/orders/${encodeURIComponent(orderId)}`,
      query: {
        fields:
          "id,status,date_created,date_updated,order_number,dealer,customer_info,totals_snapshot,selections_snapshot,external_refs"
      }
    });

    const events = await client.request<OrderEventDirectusRecord[]>({
      path: "/items/order_events",
      query: {
        fields: "id,type,note,date_created",
        sort: "-date_created",
        filter: {
          order: {
            _eq: order.id
          }
        },
        limit: 100
      }
    });

    return {
      id: order.id,
      orderNumber: order.order_number ?? null,
      status: order.status ?? null,
      createdAt: order.date_created ?? null,
      updatedAt: order.date_updated ?? null,
      dealerId: typeof order.dealer === "string" ? order.dealer : null,
      customerInfo: parseCustomerInfo(order.customer_info),
      totalsSnapshot: parseTotalsSnapshot(order.totals_snapshot),
      selectionsSnapshot: sanitizeSelectionState(order.selections_snapshot),
      externalRefs: parseExternalRefs(order.external_refs),
      events: events.map((event) => ({
        id: event.id,
        type: event.type ?? null,
        note: event.note ?? null,
        createdAt: event.date_created ?? null
      }))
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("-> 404")) {
      return null;
    }
    throw error;
  }
}

export async function updateOrderStatus(args: { orderId: string; status: OrderStatus }): Promise<{ status: OrderStatus }> {
  const { client } = requiredClient();
  if (!ORDER_STATUS_OPTIONS.includes(args.status)) {
    throw new Error("Invalid order status");
  }

  const updated = await client.request<OrderDirectusRecord, Record<string, unknown>>({
    method: "PATCH",
    path: `/items/orders/${encodeURIComponent(args.orderId)}`,
    body: {
      status: args.status
    }
  });

  await client.request<OrderEventDirectusRecord, Record<string, unknown>>({
    method: "POST",
    path: "/items/order_events",
    body: {
      order: args.orderId,
      type: pickEventType("order_updated"),
      note: `Status changed to ${args.status}`
    }
  });

  const nextStatus = typeof updated.status === "string" && ORDER_STATUS_OPTIONS.includes(updated.status as OrderStatus)
    ? (updated.status as OrderStatus)
    : args.status;

  return { status: nextStatus };
}
