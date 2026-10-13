import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export function createClient() {
  const { url, apiKey } = getSupabasePublicConfig();

  return createBrowserClient<Database>(url, apiKey);
}
