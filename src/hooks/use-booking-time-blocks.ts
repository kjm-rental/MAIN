"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isBookingTimeBlocked,
  type BookingTimeBlock,
} from "@/lib/booking-time-blocks";
import type { RentalTimeKind } from "@/lib/rental-time-slots";
async function loadBlocks(
  from: string,
  to: string,
): Promise<BookingTimeBlock[]> {
  const result = await createClient().rpc("get_booking_time_blocks", {
    p_from: from,
    p_to: to,
  });
  if (result.error)
    throw new Error("Unavailable times could not be checked. Please retry.");
  return result.data;
}
export function useBookingTimeBlocks(open: boolean, month: string) {
  const [response, setResponse] = useState<{
    key: string;
    blocks: BookingTimeBlock[];
    error: string;
  }>({ key: "", blocks: [], error: "" });
  const [retry, setRetry] = useState(0);
  const key = `${month}:${open}:${retry}`;
  useEffect(() => {
    if (!open || !/^\d{4}-\d{2}$/.test(month)) return;
    let live = true;
    const from = `${month}-01T00:00:00+08:00`;
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = `${next.toISOString().slice(0, 10)}T00:00:00+08:00`;
    loadBlocks(from, to).then(
      (blocks) => {
        if (live) setResponse({ key, blocks, error: "" });
      },
      () => {
        if (live)
          setResponse({
            key,
            blocks: [],
            error: "Unavailable times could not be checked. Please retry.",
          });
      },
    );
    return () => {
      live = false;
    };
  }, [open, month, key]);
  return {
    blocks: response.key === key ? response.blocks : [],
    loading: open && response.key !== key,
    error: response.key === key ? response.error : "",
    retry: () => setRetry((v) => v + 1),
    async checkSelected(value: string, kind: RentalTimeKind) {
      // Recheck at confirmation so newly-created Admin closures are respected.
      const from = new Date(`${value}:00+08:00`);
      const blocks = await loadBlocks(
        from.toISOString(),
        new Date(from.getTime() + 60000).toISOString(),
      );
      return !isBookingTimeBlocked(value, kind, blocks);
    },
  };
}
