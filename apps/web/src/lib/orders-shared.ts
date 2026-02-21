export const ORDER_STATUS_OPTIONS = [
  "draft",
  "submitted",
  "accepted",
  "in_production",
  "completed",
  "cancelled"
] as const;

export type OrderStatus = (typeof ORDER_STATUS_OPTIONS)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUS_OPTIONS.includes(value as OrderStatus);
}

export const ORDER_EVENT_TYPE_OPTIONS = [
  "order_created",
  "order_submitted",
  "order_updated",
  "order_cancel_requested",
  "order_accepted",
  "order_rejected",
  "order_on_hold",
  "production_scheduled",
  "in_production",
  "production_completed",
  "shipped",
  "delivered",
  "other"
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPE_OPTIONS)[number];
