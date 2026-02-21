import { NextResponse } from "next/server";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { updateQuoteCustomerInfo } from "../../../../lib/server/quotes";

export const runtime = "nodejs";

interface PatchQuoteBody {
  customer_info?: unknown;
}

interface CustomerInfoInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateCustomerInfo(value: unknown): { name: string; email: string; phone: string } {
  const input = (typeof value === "object" && value !== null ? value : {}) as CustomerInfoInput;
  const name = asTrimmedString(input.name).slice(0, MAX_NAME_LENGTH);
  const email = asTrimmedString(input.email).slice(0, MAX_EMAIL_LENGTH);
  const phone = asTrimmedString(input.phone).slice(0, MAX_PHONE_LENGTH);

  if (email.length > 0 && !BASIC_EMAIL_REGEX.test(email)) {
    throw new Error("Invalid email format");
  }

  return { name, email, phone };
}

export async function PATCH(
  request: Request,
  context: { params: { quoteId: string } }
): Promise<Response> {
  const quoteId = typeof context.params?.quoteId === "string" ? context.params.quoteId : "";
  if (!quoteId) {
    return NextResponse.json({ error: "quoteId is required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as PatchQuoteBody;
    const customerInfo = validateCustomerInfo(body.customer_info);
    const updated = await updateQuoteCustomerInfo({
      quoteId,
      customerInfo
    });

    return NextResponse.json({ customer_info: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof DirectusHttpError) {
      if (error.status === 404) {
        return NextResponse.json({ error: "Quote not found" }, { status: 404 });
      }
      if (error.status === 403) {
        return NextResponse.json({ error: "Quote not accessible" }, { status: 403 });
      }
    }
    const message = error instanceof Error ? error.message : "Failed to update quote details";
    const status = message === "Invalid email format" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
