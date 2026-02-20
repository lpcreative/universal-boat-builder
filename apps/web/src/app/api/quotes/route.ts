import { NextResponse } from "next/server";
import { createQuote, type QuotePriceBook, type QuoteViewMode } from "../../../lib/server/quotes";
import { sanitizeSelectionState } from "../../../lib/configurator-shared";

interface CreateQuoteRequestBody {
  modelVersionId?: unknown;
  selections?: unknown;
  priceBook?: unknown;
  channel?: unknown;
  customerInfo?: unknown;
  dealer?: unknown;
  activeStepId?: unknown;
  viewMode?: unknown;
}

function parsePriceBook(value: unknown): QuotePriceBook {
  return value === "dealer" ? "dealer" : "msrp";
}

function parseViewMode(value: unknown): QuoteViewMode {
  return value === "all" ? "all" : "paged";
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as CreateQuoteRequestBody;
    const modelVersionId = typeof body.modelVersionId === "string" ? body.modelVersionId : "";
    if (!modelVersionId) {
      return NextResponse.json({ error: "modelVersionId is required" }, { status: 400 });
    }

    const selections = sanitizeSelectionState(body.selections);
    const customerInfo =
      body.customerInfo && typeof body.customerInfo === "object" && !Array.isArray(body.customerInfo)
        ? (body.customerInfo as Record<string, unknown>)
        : null;
    const dealer = typeof body.dealer === "string" && body.dealer.length > 0 ? body.dealer : null;
    const channel = typeof body.channel === "string" && body.channel.length > 0 ? body.channel : "web";
    const activeStepId = typeof body.activeStepId === "string" && body.activeStepId.length > 0 ? body.activeStepId : null;

    const created = await createQuote({
      modelVersionId,
      selections,
      priceBook: parsePriceBook(body.priceBook),
      channel,
      customerInfo,
      dealer,
      activeStepId,
      viewMode: parseViewMode(body.viewMode)
    });

    return NextResponse.json({
      id: created.id,
      quote_number: created.quoteNumber
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
