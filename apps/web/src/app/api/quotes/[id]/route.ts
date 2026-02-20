import { NextResponse } from "next/server";
import { getQuoteById } from "../../../../lib/server/quotes";

interface RouteParams {
  params: { id: string };
}

export async function GET(_: Request, context: RouteParams): Promise<Response> {
  try {
    const id = context.params.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const quote = await getQuoteById(id);
    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
