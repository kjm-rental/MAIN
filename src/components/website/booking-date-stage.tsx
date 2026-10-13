"use client";
import { useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { RentalDateTimePicker } from "@/components/ui/rental-date-time-picker";
import { formatBookingDate } from "@/lib/booking-presentation";

export function BookingDateStage({
  modelId,
  pickup,
  returnAt,
  operatingHours,
  onPickup,
  onReturn,
}: {
  modelId: string;
  pickup: string;
  returnAt: string;
  operatingHours: unknown;
  onPickup: (value: string) => void;
  onReturn: (value: string) => void;
}) {
  const [active, setActive] = useState<"pickup" | "return">("pickup");
  return (
    <div className="journey-dates">
      <p className="text-muted text-sm leading-6">Confirm both your pickup and return date and time using “Use this time” to continue.</p>
      <div
        className="journey-date-switch"
        role="group"
        aria-label="Rental schedule"
      >
        <button
          type="button"
          aria-pressed={active === "pickup"}
          onClick={() => setActive("pickup")}
        >
          <span>01 · Pickup</span>
          <strong>
            {formatBookingDate(pickup) || "When does your adventure begin?"}
          </strong>
        </button>
        <ArrowRight aria-hidden="true" />
        <button
          type="button"
          disabled={!pickup}
          aria-pressed={active === "return"}
          onClick={() => setActive("return")}
        >
          <span>02 · Return</span>
          <strong>{formatBookingDate(returnAt) || "Choose your return"}</strong>
        </button>
      </div>
      <div className="journey-calendar-caption">
        <CalendarDays aria-hidden="true" />
        <span>
          {active === "pickup" ? "Choose your departure" : "Choose your return"}
        </span>
        <small>Asia/Manila</small>
      </div>
      <div className="journey-calendar">
        <RentalDateTimePicker
          key={active}
          inline
          label={
            active === "pickup"
              ? "Pickup date and time"
              : "Return date and time"
          }
          kind={active}
          operatingHours={operatingHours}
          value={active === "pickup" ? pickup : returnAt}
          after={active === "return" ? pickup : undefined}
          availability={{
            modelId,
            kind: active,
            pickup: pickup || undefined,
            returnAt: active === "pickup" ? returnAt || undefined : undefined,
            durationMinutes: 1440,
          }}
          onChange={(value) => {
            if (active === "pickup") {
              onPickup(value);
              setActive("return");
            } else onReturn(value);
          }}
        />
      </div>
      <p className="journey-calendar-legend">
        <span /> Available <span /> Selected <span /> Not available
      </p>
    </div>
  );
}
