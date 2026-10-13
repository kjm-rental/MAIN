// Only methods implemented by our hosted Checkout integration are eligible.
export function supportedCheckoutMethods(capabilities: unknown): ("card" | "qrph")[] {
  if (!Array.isArray(capabilities) || !capabilities.every(method => typeof method === "string")) return [];
  return (["card", "qrph"] as const).filter(method => capabilities.includes(method));
}
