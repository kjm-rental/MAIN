import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
import {
  accountMethods,
  availableMethods,
  respond,
} from "@/lib/paymongo/test-payments";
export async function GET() {
  if (!customerOnlinePaymentsEnabled)
    return respond({ methods: [], onlineEnabled: false });
  try {
    if (process.env.PAYMONGO_MODE !== "live")
      return respond({ methods: [], onlineEnabled: false });
    const { guestDb } = await import("@/lib/guest-checkout/server");
    const { data: options, error } = await guestDb().rpc(
      "get_delivery_options",
    );
    if (error || !options?.qrph_enabled || !options?.qrph_ready)
      return respond({ methods: [], onlineEnabled: false });
    const methods = await accountMethods();
    let onlineEnabled = false;
    try {
      await availableMethods();
      onlineEnabled = true;
    } catch {
      /* preview only */
    }
    return respond({
      methods: methods.filter((method) => method === "qrph"),
      onlineEnabled,
    });
  } catch {
    return respond({ methods: [], onlineEnabled: false });
  }
}
