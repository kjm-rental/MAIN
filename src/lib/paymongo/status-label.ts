/** Labels describe server-verified states, never URL query parameters. */
export function paymentStatusLabel(status?: string) {
  return (
    (
      {
        paid: "Paid — verified by PayMongo",
        review_required: "Payment received — owner review required",
        pending: "Payment pending",
        prepared: "Payment not started",
        session_created: "Payment pending",
        failed_unpaid: "Payment failed — no successful payment verified",
        cancelled_unpaid: "Payment cancelled — no successful payment verified",
        expired_unpaid: "Checkout expired — no successful payment verified",
        not_started: "Payment not started",
        unpaid: "Payment not yet received",
        unavailable: "Payment status is temporarily unavailable",
        creation_unresolved:
          "Payment setup needs verification — contact KJM before retrying",
      } as Record<string, string>
    )[status ?? ""] ?? "Payment status is temporarily unavailable"
  );
}
