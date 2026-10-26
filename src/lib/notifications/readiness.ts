import { z } from "zod";
import type { RPC } from "./worker";
export async function notificationReady(rpc: RPC, reminders: boolean) {
  const state = z
    .object({
      guest_binding_ready: z.literal(true),
      resend_enabled: z.literal(true),
      reminders_enabled: z.boolean(),
      activation_recorded: z.literal(true),
    })
    .safeParse(await rpc("notification_runtime_status", {}));
  return state.success && (!reminders || state.data.reminders_enabled);
}
