import type { Evidence } from "@dailycart/schemas";

// The hosted serverless bundle cannot rely on files outside the Vercel project
// root. These compact, deterministic records keep the operator demo executable
// while the full company pack remains available in the repository and locally.
export const embeddedDemoEvidence: Evidence[] = [
  { id: "EVD-1001", kind: "interview", title: "Checkout recovery interview", summary: "I retried checkout three times and never knew what to fix.", occurredAt: "2026-07-10T12:00:00.000Z", customerId: "CUS-0001", sentiment: "negative", tags: ["checkout-recovery"], sourceMode: "synthetic" },
  { id: "EVD-1002", kind: "support", title: "Address validation loop", summary: "Mobile shoppers report an address validation loop after returning to checkout.", occurredAt: "2026-07-10T12:05:00.000Z", customerId: "CUS-0002", sentiment: "negative", tags: ["checkout-recovery"], sourceMode: "synthetic" },
  { id: "EVD-1003", kind: "analytics", title: "Recovery exits", summary: "Checkout recovery failures exit within twenty seconds of a validation error.", occurredAt: "2026-07-10T12:10:00.000Z", sentiment: "negative", tags: ["checkout-recovery"], sourceMode: "synthetic" },
  { id: "EVD-1004", kind: "incident", title: "Interrupted cart session", summary: "A mobile viewport transition lost the shopper cart state before payment.", occurredAt: "2026-07-10T12:15:00.000Z", sentiment: "mixed", tags: ["cart-persistence"], sourceMode: "synthetic" },
  { id: "EVD-1005", kind: "support", title: "Returned cart is empty", summary: "Returning shoppers expect their saved cart to remain available after an interruption.", occurredAt: "2026-07-10T12:20:00.000Z", customerId: "CUS-0003", sentiment: "negative", tags: ["cart-persistence"], sourceMode: "synthetic" },
  { id: "EVD-1006", kind: "analytics", title: "Cart return gap", summary: "Cart return sessions convert below the baseline after a checkout interruption.", occurredAt: "2026-07-10T12:25:00.000Z", sentiment: "negative", tags: ["cart-persistence"], sourceMode: "synthetic" },
  { id: "EVD-1007", kind: "survey", title: "Clear error guidance", summary: "Customers prefer clear error guidance over faster animation during checkout.", occurredAt: "2026-07-10T12:30:00.000Z", sentiment: "mixed", tags: ["checkout-recovery"], sourceMode: "synthetic" },
  { id: "EVD-1008", kind: "discussion", title: "Telemetry coverage", summary: "The delivery team needs recovery success and feature exposure events before release.", occurredAt: "2026-07-10T12:35:00.000Z", sentiment: "neutral", tags: ["cart-persistence"], sourceMode: "synthetic" }
];
