import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { isOrderStatus } from "../../../../lib/orders-shared";
import { updateOrderStatus } from "../../../../lib/server/orders";

export const runtime = "nodejs";

interface PatchOrderBody {
  status?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: { orderId: string } }
): Promise<Response> {
  const orderId = typeof context.params?.orderId === "string" ? context.params.orderId : "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as PatchOrderBody;
    if (!isOrderStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updated = await updateOrderStatus({ orderId, status: body.status });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof DirectusHttpError) {
      if (error.status === 404) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (error.status === 403) {
        return NextResponse.json({ error: "Order not accessible" }, { status: 403 });
      }
    }
    const message = error instanceof Error ? error.message : "Failed to update order status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
