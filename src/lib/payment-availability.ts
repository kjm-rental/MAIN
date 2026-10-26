// Operator sets this only AFTER live provider, webhook, reconciliation and concurrency verification.
// Server configuration, provider capabilities and database readiness independently gate creation.
export const customerOnlinePaymentsEnabled: boolean =
  process.env.NEXT_PUBLIC_QRPH_LIVE_VERIFIED === "true";
