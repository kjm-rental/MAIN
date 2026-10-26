import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ScreeningResult } from "./document-prescreen";

/** Advisory audit only. Never writes a verification decision or retains OCR fields. */
export async function recordDocumentPrescreen(input: {
  bookingId: string;
  ownerId: string | null;
  documentIds: string[];
  result: ScreeningResult;
}): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(3000) }),
      },
    });
    const { data, error } = await db.rpc("record_verification_prescreen", {
      p_booking_id: input.bookingId,
      p_owner_id: input.ownerId,
      p_document_ids: input.documentIds,
      p_summary: {
        preliminaryStatus: input.result.preliminaryStatus,
        riskLevel: input.result.riskLevel,
        riskStatus: input.result.riskStatus,
        reviewReasons: input.result.reviewReasons,
        identityReviewRequired: true,
        checks: input.result.checks,
        corrections: input.result.corrections,
        checkedAt: input.result.checkedAt,
      },
    });
    return !error && data === true;
  } catch {
    // No provider/storage details, OCR data or credentials are logged.
    return false;
  }
}
