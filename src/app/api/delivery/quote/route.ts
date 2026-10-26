import { z } from "zod";
import { serviceSelectionSchema } from "@/lib/delivery/schema";
import {
  guestDb,
  guestResponse,
  sameOrigin,
} from "@/lib/guest-checkout/server";
const input = z.object({
  selection: serviceSelectionSchema,
  start: z.iso.datetime(),
  end: z.iso.datetime(),
});
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return guestResponse({ error: "Please use the KJM website." }, 403);
  try {
    if (Number(request.headers.get("content-length")) > 14000) throw Error();
    const d = input.parse(await request.json());
    const { data, error } = await guestDb().rpc("get_delivery_quote", {
      p_selection: d.selection,
      p_start: d.start,
      p_end: d.end,
    });
    if (error)
      return guestResponse(
        {
          error:
            "Check your service areas, addresses and delivery/collection operating hours. Refresh if prices changed.",
        },
        400,
      );
    return guestResponse(data);
  } catch {
    return guestResponse(
      { error: "Please check your delivery and collection details." },
      400,
    );
  }
}
