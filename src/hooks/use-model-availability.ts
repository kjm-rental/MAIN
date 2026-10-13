"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { availabilityErrorMessage } from "@/lib/availability-error";
import {
  availabilityPeriod,
  type AvailabilityContext,
} from "@/lib/availability-periods";
import {
  isRentalTimeSelectable,
  rentalTimeSlots,
  type RentalOperatingHours,
} from "@/lib/rental-time-slots";
export function useModelAvailability({
  context,
  hours,
  month,
  open,
  now,
}: {
  context?: AvailabilityContext;
  hours: RentalOperatingHours | null;
  month: string;
  open: boolean;
  now: Date;
}) {
  const [response, setResponse] = useState<{
    signature: string;
    counts: Record<string, number>;
    error: string;
  }>({ signature: "", counts: {}, error: "" });
  const [refreshKey, refresh] = useState(0);
  const modelId = context?.modelId,
    kind = context?.kind,
    pickup = context?.pickup,
    returnAt = context?.returnAt,
    duration = context?.durationMinutes;
  const periods = useMemo(() => {
    if (!modelId || !kind || !hours || !month) return [];
    const total = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    ).getUTCDate();
    const map = new Map<
      string,
      NonNullable<ReturnType<typeof availabilityPeriod>>
    >();
    for (let d = 1; d <= total; d++)
      for (const slot of rentalTimeSlots(
        `${month}-${String(d).padStart(2, "0")}`,
        hours,
        kind,
      )) {
        if (
          !isRentalTimeSelectable(
            slot.value,
            now,
            kind === "return" ? pickup : undefined,
          )
        )
          continue;
        const period = availabilityPeriod(slot.value, {
          modelId,
          kind,
          pickup,
          returnAt,
          durationMinutes: duration ?? 1440,
        });
        if (period) map.set(slot.value, period);
      }
    return [...map.values()];
  }, [modelId, kind, pickup, returnAt, duration, hours, month, now]);
  const signature = JSON.stringify([
    modelId,
    kind,
    pickup,
    returnAt,
    duration,
    month,
    now.getTime(),
    hours,
    refreshKey,
    open,
  ]);
  const current = response.signature === signature;
  const counts = current ? response.counts : {};
  const error = current ? response.error : "";
  const loading = Boolean(modelId && open && hours && !current);
  useEffect(() => {
    if (!modelId || !open || !hours) return;
    let live = true;
    async function load() {
      try {
        const result = await createClient().rpc("get_model_slot_availability", {
          p_model_id: modelId!,
          p_periods: periods,
        });
        if (result.error)
          throw new Error(availabilityErrorMessage(result.error));
        if (live)
          setResponse({
            signature,
            counts: Object.fromEntries(
              (result.data ?? []).map((row) => [
                row.slot_key,
                row.available_count,
              ]),
            ),
            error: "",
          });
      } catch (e) {
        if (live)
          setResponse({
            signature,
            counts: {},
            error: e instanceof Error ? e.message : "Availability unavailable.",
          });
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [modelId, open, hours, periods, signature]);
  async function checkSelected(value: string) {
    if (!context) return true;
    const period = availabilityPeriod(value, context);
    if (!period) return false;
    const r = await createClient().rpc("get_model_slot_availability", {
      p_model_id: context.modelId,
      p_periods: [period],
    });
    if (r.error) throw new Error(availabilityErrorMessage(r.error));
    const count = r.data?.[0]?.available_count ?? 0;
    setResponse((previous) =>
      previous.signature === signature
        ? { ...previous, counts: { ...previous.counts, [value]: count } }
        : previous,
    );
    return count > 0;
  }
  return {
    counts,
    loading,
    error,
    refresh: () => refresh((v) => v + 1),
    checkSelected,
  };
}
