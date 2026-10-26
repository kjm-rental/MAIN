/** Explicit live mode accepts operator casing; readiness gates remain independent. */
export function paymongoLiveMode() {
  return process.env.PAYMONGO_MODE?.trim().toLowerCase() === "live";
}
