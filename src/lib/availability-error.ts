export function availabilityErrorMessage(error: { code?: string }): string {
  return error.code === "PGRST202"
    ? "Live availability is not configured yet. Please retry or contact KJM for help choosing dates."
    : "Live availability could not be loaded. Please retry.";
}
