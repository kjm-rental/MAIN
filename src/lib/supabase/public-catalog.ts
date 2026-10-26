import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./env";
import type { Database } from "@/types/database";

/** Anonymous public reads must not refresh or depend on a customer's session. */
export function createPublicCatalogClient() {
  const { url, apiKey } = getSupabasePublicConfig();
  return createClient<Database>(url, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
