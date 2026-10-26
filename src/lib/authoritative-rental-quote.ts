import type { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
export async function authoritativeRentalQuote(
  client: ReturnType<typeof createClient>,
  args: {
    p_model_id: string;
    p_start_at: string;
    p_end_at: string;
    p_extra_items: Json;
  },
  deposit?: { option: string; document: string | null },
) {
  const result = await client.rpc("get_booking_quote_v4", {
    ...args,
    p_deposit_option: deposit?.option ?? null,
    p_document_type: deposit?.document ?? null,
  });
  if (!result.error)
    return { data: result.data ? [result.data] : null, error: null };
  // Only an absent migration permits legacy fallback. Pricing/authorization errors stay errors.
  if (!["PGRST202", "42883"].includes(result.error.code))
    return { data: null, error: result.error };
  return deposit
    ? client.rpc("get_booking_quote_v3", {
        ...args,
        p_deposit_option: deposit.option,
        p_document_type: deposit.document,
      })
    : client.rpc("get_booking_quote_v2", args);
}
