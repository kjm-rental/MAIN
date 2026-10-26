import { createClient } from "@supabase/supabase-js";
import type { RPC, WorkerConfig } from "./worker";

export function notificationServer(): { rpc: RPC; config: WorkerConfig } {
  const apiKey = process.env.RESEND_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !url || !key)
    throw new Error("Notification configuration required");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(3000) }),
    },
  });
  const rpc: RPC = async (name, args) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error("Notification database operation failed");
    return data;
  };
  return {
    rpc,
    config: {
      apiKey,
      testRecipient: process.env.RESEND_TEST_RECIPIENT,
      review: process.env.KJM_REVIEW_URL,
      app: process.env.KJM_CUSTOMER_APP_URL,
      admin: process.env.KJM_ADMIN_URL || process.env.KJM_ADMIN_BASE_URL,
    },
  };
}
