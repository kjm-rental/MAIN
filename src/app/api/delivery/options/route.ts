import { guestDb, guestResponse } from "@/lib/guest-checkout/server";
import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
export async function GET() {
  try {
    const { data, error } = await guestDb().rpc("get_delivery_options");
    if (error) {
      if (["PGRST202", "42883"].includes(error.code))
        return guestResponse({
          enabled: false,
          cash_enabled: true,
          qrph_enabled: false,
          qrph_ready: false,
          areas: [],
        });
      throw error;
    }
    return guestResponse({
      ...data,
      qrph_ready: customerOnlinePaymentsEnabled && data.qrph_ready,
    });
  } catch {
    return guestResponse(
      { error: "Service options are temporarily unavailable." },
      503,
    );
  }
}
