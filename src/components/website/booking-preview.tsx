"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, Search } from "lucide-react";
import Link from "next/link";
import { RentalDateTimePicker } from "@/components/ui/rental-date-time-picker";
import { createClient } from "@/lib/supabase/client";
import { validateRentalPeriod } from "@/lib/booking";
import type { MotorcycleModel } from "@/types/motorcycle";

export function BookingPreview({
  motorcycles,
}: {
  motorcycles: readonly MotorcycleModel[];
}) {
  const [message, setMessage] = useState("");
  const [pickup, setPickup] = useState("");
  const [busy, setBusy] = useState(false),
    [available, setAvailable] = useState<string[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setAvailable([]);
    try {
      const period = validateRentalPeriod(
        String(values.get("pickup")),
        String(values.get("returnAt")),
      );
      const results = await Promise.all(
        motorcycles
          .filter((m) => m.id)
          .map(async (m) => {
            const result = await createClient().rpc(
              "check_model_availability",
              {
                p_model_id: m.id!,
                p_start_at: period.startAt,
                p_end_at: period.endAt,
              },
            );
            if (result.error) throw new Error(result.error.message);
            return (result.data ?? 0) > 0 ? m.slug : null;
          }),
      );
      const found = results.filter((s): s is string => Boolean(s));
      setAvailable(found);
      setMessage(
        found.length
          ? `${found.length} models available. Availability is checked again during submission.`
          : "No models available for these dates. Try another rental period.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Availability could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="plan-your-ride"
      className="border-deep-teal/10 bg-off-white text-deep-teal relative scroll-mt-24 rounded-[1.75rem] border p-5 shadow-[0_24px_70px_rgba(18,59,66,0.18)] sm:p-7"
    >
      <div className="flex items-center gap-3">
        <span className="bg-sand text-ocean inline-flex size-10 items-center justify-center rounded-full">
          <CalendarDays aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-deep-teal font-bold">Plan your ride</p>
          <p className="text-muted text-xs">Your island time · Asia/Manila</p>
        </div>
      </div>
      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <RentalDateTimePicker
          label="Pickup date & time"
          kind="pickup"
          value={pickup}
          onChange={setPickup}
          name="pickup"
          required
        />
        <RentalDateTimePicker
          label="Return date & time"
          kind="return"
          after={pickup || undefined}
          name="returnAt"
          required
        />
        <button
          type="submit"
          disabled={busy || !motorcycles.length}
          className="bg-sunset text-deep-teal hover:bg-sand inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold transition-colors"
        >
          <Search aria-hidden="true" className="size-4" />
          {busy ? "Checking availability…" : "Find your ride"}
        </button>
      </form>
      {available.length > 0 && (
        <ul className="mt-4 space-y-2">
          {motorcycles
            .filter((m) => available.includes(m.slug))
            .map((m) => (
              <li key={m.slug}>
                <Link
                  className="text-ocean text-sm font-bold underline"
                  href={`/book/${m.slug}`}
                >
                  {m.model} →
                </Link>
              </li>
            ))}
        </ul>
      )}
      <p className="text-muted mt-4 text-[11px] leading-5">
        Online requests are restricted during launch preparations. Requests
        require document review and KJM approval.
      </p>
      {message ? (
        <p
          role="status"
          className="bg-ocean/10 text-deep-teal mt-4 rounded-xl p-3 text-xs leading-5"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
