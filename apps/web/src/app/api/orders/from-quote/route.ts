import { NextResponse } from "next/server";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { createOrderFromQuote } from "../../../../lib/server/orders";

export const runtime = "nodejs";

interface FromQuoteBody {
  quoteId?: unknown;
}

function parseQuoteId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as FromQuoteBody;
    const quoteId = parseQuoteId(body.quoteId);
    if (!quoteId) {
      return NextResponse.json({ error: "quoteId is required" }, { status: 400 });
    }

    const created = await createOrderFromQuote({ quoteId });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof DirectusHttpError) {
      if (error.status === 404) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }
      if (error.status === 403) {
        return NextResponse.json({ error: "Order creation not permitted" }, { status: 403 });
      }
    }
    const message = error instanceof Error ? error.message : "Failed to convert quote to order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
