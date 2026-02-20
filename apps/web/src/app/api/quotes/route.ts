import { NextResponse } from "next/server";
import type { SelectionState } from "../../../lib/configurator-shared";
import { sanitizeSelectionState } from "../../../lib/configurator-shared";
import { createQuoteFromConfigurator, type QuotePriceBook, type QuoteViewMode } from "../../../lib/server/quotes";

export const runtime = "nodejs";

interface CreateQuoteRequestBody {
  modelVersionId?: unknown;
  modelLabel?: unknown;
  priceBook?: unknown;
  selections?: unknown;
  encodedSelections?: unknown;
  stepId?: unknown;
  viewMode?: unknown;
  resumeUrl?: unknown;
}

function parsePriceBook(value: unknown): QuotePriceBook {
  return value === "dealer" ? "dealer" : "msrp";
}

function parseViewMode(value: unknown): QuoteViewMode {
  return value === "all" ? "all" : "paged";
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as CreateQuoteRequestBody;
    const modelVersionId = parseOptionalString(body.modelVersionId);
    if (!modelVersionId) {
      return NextResponse.json({ error: "modelVersionId is required" }, { status: 400 });
    }

    const selections = sanitizeSelectionState(body.selections) as SelectionState;
    const created = await createQuoteFromConfigurator({
      modelVersionId,
      modelLabel: parseOptionalString(body.modelLabel),
      priceBook: parsePriceBook(body.priceBook),
      selections,
      encodedSelections: parseOptionalString(body.encodedSelections),
      stepId: parseOptionalString(body.stepId),
      viewMode: parseViewMode(body.viewMode),
      resumeUrl: parseOptionalString(body.resumeUrl)
    });

    return NextResponse.json(
      {
        id: created.id,
        quoteNumber: created.quoteNumber
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
