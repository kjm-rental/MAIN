import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, apiKey } = getSupabasePublicConfig();

  return createServerClient<Database>(url, apiKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. A future auth proxy will
          // handle session refresh before protected routes are introduced.
        }
      },
    },
  });
}
