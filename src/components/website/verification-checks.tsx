"use client";
import { useState } from "react";
import { VerificationResubmission } from "./verification-resubmission";
import type { VerificationProgress } from "@/lib/verification-progress";
type Summary = {
  preliminaryStatus:
    "passed" | "correction_required" | "manual_review_required";
  corrections: { documentKind: string; message: string }[];
  riskLevel?: 1 | 2 | 3;
  reviewReasons?: string[];
};
export function VerificationChecks({
  bookingId,
  initialProgress,
  allowChecks = true,
}: {
  bookingId: string;
  initialProgress?: VerificationProgress | null;
  allowChecks?: boolean;
}) {
  const finalDecision = ["approved", "rejected"].includes(
    initialProgress?.overallStatus ?? "",
  );
  const current = initialProgress?.checks.find((item) => item.current);
  const [result, setResult] = useState<Summary | null>(
    current?.summary ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/verification/${bookingId}/prescreen`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch {
      setError(
        "Automatic checks are unavailable. Your documents remain private and KJM can review them manually.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border-deep-teal/15 mt-6 rounded-2xl border p-5">
      <h2 className="text-xl font-bold">Automatic document checks</h2>
      <p className="text-muted mt-2 text-sm">
        Check readability and document consistency. Passing these preliminary
        checks does not verify your identity or authorize motorcycle pickup.
      </p>
      <button
        type="button"
        onClick={() => void check()}
        disabled={busy || finalDecision || !allowChecks}
        className="bg-deep-teal mt-4 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "Checking documents…" : "Check my documents"}
      </button>
      <div role="status" className="mt-3 text-sm">
        {error}
        {result && (
          <>
            <p>
              {result.riskLevel ? `Risk level ${result.riskLevel} · ` : ""}
              {result.preliminaryStatus === "passed"
                ? "Automatic document checks passed. Your official identity decision is shown above; OCR does not authenticate identity."
                : result.preliminaryStatus === "correction_required"
                  ? "Correction Required. Your booking remains independent of these document corrections; upload the requested documents below."
                  : "Manual review required. Some details could not be read or matched confidently; this is not a rejection."}
            </p>
            {result.reviewReasons && (
              <details className="mt-3">
                <summary>Review reasons</summary>
                <ul className="list-disc pl-5">
                  {result.reviewReasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </details>
            )}
            {result.corrections.length > 0 && (
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {result.corrections.map((item, index) => (
                  <li key={index}>
                    <strong className="capitalize">
                      {item.documentKind.replaceAll("_", " ")}:{" "}
                    </strong>
                    {item.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {allowChecks &&
      !finalDecision &&
      (initialProgress?.uploadKinds.length || result?.corrections.length) ? (
        <VerificationResubmission
          bookingId={bookingId}
          title="Upload a correction"
          instructions="Upload the correct document. Approved or rejected decisions cannot be changed here. KJM must review corrected documents before approval. If a correction is not yet authorized, KJM must request it first."
          onSubmitted={() => setResult(null)}
          documents={(initialProgress
            ? initialProgress.uploadKinds
            : (result?.corrections.map((item) => item.documentKind) ?? [])
          ).map((kind) => ({ document_kind: kind }))}
        />
      ) : null}
      {initialProgress && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold">
            Verification history
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {initialProgress.reviews.map((review) => (
              <li key={review.id}>
                <strong>
                  {review.type} · {review.result.replaceAll("_", " ")}
                </strong>
                <p>{review.reason}</p>
                <time>
                  {new Date(review.createdAt).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                  })}
                </time>
              </li>
            ))}
            {initialProgress.checks.map((item) => (
              <li key={item.id}>
                Automatic checks:{" "}
                {item.summary.preliminaryStatus.replaceAll("_", " ")} ·{" "}
                {item.current ? "Current uploads" : "Previous uploads"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
