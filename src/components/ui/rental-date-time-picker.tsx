"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useModelAvailability } from "@/hooks/use-model-availability";
import type { AvailabilityContext } from "@/lib/availability-periods";
import { createClient } from "@/lib/supabase/client";
import {
  formatRentalTime,
  isRentalTimeSelectable,
  manilaDay,
  readRentalOperatingHours,
  rentalTimeSlots,
  type RentalTimeKind,
} from "@/lib/rental-time-slots";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import "./rental-time-selection.css";

function dayString(date: Date) {
  return date.toISOString().slice(0, 10);
}
function asDate(day: string) {
  return new Date(`${day}T12:00:00Z`);
}
export function RentalDateTimePicker({
  label,
  name,
  value,
  onChange,
  required = false,
  kind = "pickup",
  operatingHours,
  after,
  availability,
  inline = false,
}: {
  label: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  kind?: RentalTimeKind;
  operatingHours?: unknown;
  after?: string;
  availability?: AvailabilityContext;
  inline?: boolean;
}) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [internal, setInternal] = useState(""),
    [day, setDay] = useState(() =>
      inline ? value?.slice(0, 10) || manilaDay(new Date()) : "",
    ),
    [month, setMonth] = useState(() =>
      inline ? value?.slice(0, 7) || manilaDay(new Date()).slice(0, 7) : "",
    ),
    [selectedTime, setSelectedTime] = useState(value || ""),
    [loadedHours, setLoadedHours] = useState<unknown>(null),
    [loadingHours, setLoadingHours] = useState(false),
    [hoursError, setHoursError] = useState(false),
    [isOpen, setIsOpen] = useState(inline),
    [now, setNow] = useState(() => new Date());
  const hours = useMemo(
    () =>
      readRentalOperatingHours(
        operatingHours === undefined ? loadedHours : operatingHours,
      ),
    [operatingHours, loadedHours],
  );
  const liveAvailability = useModelAvailability({
    context: availability,
    hours,
    month,
    open: isOpen,
    now,
  });
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [checkingSelection, setCheckingSelection] = useState(false);
  const slots = rentalTimeSlots(day, hours, kind);
  const selectable = (time: string, clock = now) =>
    isRentalTimeSelectable(time, clock, after) &&
    (!availability ||
      (!liveAvailability.loading &&
        !liveAvailability.error &&
        (liveAvailability.counts[time] ?? 0) > 0));
  const selectedSlot = slots.find((slot) => slot.value === selectedTime);
  const canApply = Boolean(
    selectedSlot &&
    selectable(selectedSlot.value) &&
    !loadingHours &&
    !hoursError &&
    !checkingSelection,
  );
  const today = manilaDay(now);
  function dayAvailable(date: string) {
    return (
      date >= today &&
      rentalTimeSlots(date, hours, kind).some((slot) => selectable(slot.value))
    );
  }
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, [isOpen]);
  async function loadHours() {
    if (operatingHours !== undefined) return;
    setLoadingHours(true);
    setHoursError(false);
    try {
      const result = await createClient()
        .from("booking_settings")
        .select("operating_hours")
        .maybeSingle();
      if (
        result.error ||
        !readRentalOperatingHours(result.data?.operating_hours)
      )
        throw new Error("Operating hours unavailable");
      setLoadedHours(result.data?.operating_hours);
    } catch {
      setLoadedHours(null);
      setHoursError(true);
    } finally {
      setLoadingHours(false);
    }
  }
  const current = value ?? internal;
  function open() {
    const clock = new Date();
    setNow(clock);
    const selected = current.slice(0, 10) || manilaDay(clock);
    setDay(selected);
    setMonth(selected.slice(0, 7));
    setSelectedTime(current);
    setAvailabilityMessage("");
    setIsOpen(true);
    void loadHours();
    dialog.current?.showModal();
  }
  function close() {
    if (inline) return;
    setIsOpen(false);
    dialog.current?.close();
    trigger.current?.focus();
  }
  async function apply() {
    const clock = new Date();
    setNow(clock);
    if (!canApply || !selectedSlot || !selectable(selectedSlot.value, clock))
      return;
    setCheckingSelection(true);
    try {
      if (!(await liveAvailability.checkSelected(selectedSlot.value))) {
        setAvailabilityMessage(
          "Fully booked for your selected dates. Please choose another date or motorcycle.",
        );
        liveAvailability.refresh();
        return;
      }
      const next = selectedSlot.value;
      setInternal(next);
      onChange?.(next);
      close();
    } catch (e) {
      setAvailabilityMessage(
        e instanceof Error ? e.message : "Availability could not be verified.",
      );
    } finally {
      setCheckingSelection(false);
    }
  }
  const first = month ? asDate(`${month}-01`) : null;
  const days = first
    ? new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
      ).getUTCDate()
    : 0;
  function moveMonth(delta: number) {
    if (!first) return;
    const next = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1, 12),
    );
    setMonth(dayString(next).slice(0, 7));
  }
  const display = current
    ? `${asDate(current.slice(0, 10)).toLocaleDateString("en-PH", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })} · ${formatRentalTime(current.slice(11))}`
    : "Choose date & time";
  const panel = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ocean text-[10px] font-bold tracking-widest uppercase">
            Your island time
          </p>
          <h2 id={`${id}-title`} className="mt-1 text-xl font-bold">
            {label}
          </h2>
          <p className="text-muted mt-1 text-xs">
            Asia/Manila · Philippine time
          </p>
        </div>
        {!inline && (
          <button
            type="button"
            onClick={close}
            aria-label="Close date picker"
            className="border-control-border grid size-11 shrink-0 place-items-center rounded-full border"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="my-4 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => moveMonth(-1)}
          className="hover:bg-sand grid size-11 place-items-center rounded-full"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p aria-live="polite" className="font-bold">
          {first?.toLocaleDateString("en-PH", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => moveMonth(1)}
          className="hover:bg-sand grid size-11 place-items-center rounded-full"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-muted py-2 text-[10px] font-bold">
            {d}
          </span>
        ))}
        {Array.from({ length: first?.getUTCDay() ?? 0 }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          return (
            <button
              key={date}
              type="button"
              data-calendar-day={date}
              aria-label={asDate(date).toLocaleDateString("en-PH", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
              disabled={!dayAvailable(date) || loadingHours || hoursError}
              title={
                !dayAvailable(date) &&
                !loadingHours &&
                !liveAvailability.loading
                  ? "Not available on this date."
                  : undefined
              }
              aria-pressed={date === day}
              onClick={() => {
                setDay(date);
                setSelectedTime("");
              }}
              onKeyDown={(e) => {
                const offset = {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7,
                }[e.key];
                if (offset === undefined) return;
                e.preventDefault();
                const target = asDate(date);
                target.setUTCDate(target.getUTCDate() + offset);
                let next = dayString(target);
                for (
                  let attempts = 0;
                  !dayAvailable(next) && attempts < 370;
                  attempts++
                ) {
                  target.setUTCDate(target.getUTCDate() + offset);
                  next = dayString(target);
                }
                if (!dayAvailable(next)) return;
                setDay(next);
                setSelectedTime("");
                if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
                requestAnimationFrame(() =>
                  dialog.current
                    ?.querySelector<HTMLButtonElement>(
                      `[data-calendar-day="${next}"]`,
                    )
                    ?.focus(),
                );
              }}
              className={`min-h-10 rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${date === day ? "bg-deep-teal text-white" : "hover:bg-sand text-deep-teal"}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="border-deep-teal/15 mt-3 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <p id={`${id}-times`} className="text-xs font-bold">
            Choose a time
          </p>
          <p aria-live="polite" className="text-ocean text-xs font-semibold">
            {selectedSlot
              ? `${selectedSlot.label}${selectedSlot.nextDay ? " · next day" : ""}`
              : ""}
          </p>
        </div>
        <p id={`${id}-time-note`} className="text-muted mt-1 text-xs leading-5">
          {loadingHours
            ? "Loading KJM’s operating hours…"
            : liveAvailability.loading
              ? "Checking motorcycle availability…"
              : availability && kind === "return" && !availability.pickup
                ? "Choose a pickup date and time first."
                : hoursError || !hours
                  ? "Operating hours are unavailable. Please contact KJM."
                  : "KJM hours · availability checked at booking."}
        </p>
        {(liveAvailability.error || availabilityMessage) && (
          <p role="alert" className="text-muted mt-2 text-xs">
            {availabilityMessage || liveAvailability.error}
            <button
              type="button"
              onClick={() => {
                setAvailabilityMessage("");
                liveAvailability.refresh();
              }}
              className="ml-2 font-bold underline"
            >
              Retry availability
            </button>
          </p>
        )}
        <div
          role="group"
          aria-labelledby={`${id}-times`}
          aria-describedby={`${id}-time-note`}
          className={`rental-time-grid mt-2 grid ${inline ? "max-h-48" : "max-h-28"} grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-1`}
        >
          {!loadingHours &&
            !hoursError &&
            slots.map((slot) => (
              <button
                key={slot.value}
                type="button"
                data-time-slot={slot.value}
                disabled={!selectable(slot.value)}
                aria-pressed={selectedTime === slot.value}
                aria-label={`${slot.label}${slot.nextDay ? `, next day (${slot.value.slice(0, 10)})` : ""}`}
                onClick={() => setSelectedTime(slot.value)}
                onKeyDown={(event) => {
                  const buttons = Array.from(
                    event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                      "button:not(:disabled)",
                    ),
                  );
                  const index = buttons.indexOf(event.currentTarget);
                  const offset = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -3,
                    ArrowDown: 3,
                  }[event.key];
                  const target =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? buttons.length - 1
                        : offset === undefined
                          ? null
                          : Math.max(
                              0,
                              Math.min(buttons.length - 1, index + offset),
                            );
                  if (target === null) return;
                  event.preventDefault();
                  buttons[target]?.focus();
                }}
                className={`focus-visible:outline-ocean min-h-11 rounded-xl border px-1 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-35 ${selectedTime === slot.value ? "border-deep-teal bg-deep-teal text-white" : "border-deep-teal/20 text-deep-teal hover:border-sunset hover:bg-sand/60 bg-white"}`}
              >
                {slot.label}
                {slot.nextDay && (
                  <span className="mt-0.5 block text-[10px]">Next day</span>
                )}
              </button>
            ))}
        </div>
        {!loadingHours &&
          !liveAvailability.loading &&
          !liveAvailability.error &&
          hours &&
          !slots.some((slot) => selectable(slot.value)) && (
            <p role="status" className="text-muted mt-2 text-xs">
              {availability &&
              !liveAvailability.loading &&
              !liveAvailability.error
                ? "Fully booked for your selected dates. Please choose another date or motorcycle."
                : `No selectable ${kind} times on this date. Choose another date.`}
            </p>
          )}
      </div>
      <div className="mt-5 flex gap-2">
        {!inline && (
          <button
            type="button"
            onClick={close}
            className="border-control-border min-h-12 flex-1 rounded-full border text-sm font-bold"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={apply}
          disabled={!canApply}
          className="bg-sunset text-deep-teal min-h-12 flex-1 rounded-full text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use this time
        </button>
      </div>
    </>
  );
  return (
    <div className="space-y-2">
      <label
        id={`${id}-label`}
        className="text-deep-teal block text-xs font-bold"
      >
        {label}
      </label>
      {!inline && (
        <button
          ref={trigger}
          type="button"
          aria-labelledby={`${id}-label ${id}-value`}
          aria-haspopup="dialog"
          onClick={open}
          className="rental-picker-trigger border-control-border text-deep-teal hover:bg-sand/60 flex min-h-12 w-full items-center gap-3 rounded-xl border bg-[#FAF7F0] px-4 text-left text-sm transition"
        >
          <CalendarDays
            className="text-ocean size-4 shrink-0"
            aria-hidden="true"
          />
          <span id={`${id}-value`} className="min-w-0 flex-1">
            {display}
          </span>
        </button>
      )}
      {inline && (
        <p className="text-ocean min-h-6 text-sm font-bold" aria-live="polite">
          {display}
        </p>
      )}
      <input
        type="datetime-local"
        name={name}
        value={current}
        onChange={(e) => {
          setInternal(e.target.value);
          onChange?.(e.target.value);
        }}
        required={required}
        tabIndex={-1}
        aria-label={label}
        className="sr-only"
        onInvalid={(e) => {
          e.preventDefault();
          open();
        }}
      />
      {inline ? (
        <section
          aria-labelledby={`${id}-title`}
          className="rental-calendar border-deep-teal/15 min-w-0 rounded-3xl border bg-[#FAF7F0] p-4 sm:p-5"
        >
          {panel}
        </section>
      ) : (
        <dialog
          ref={dialog}
          aria-labelledby={`${id}-title`}
          onCancel={() => {
            setIsOpen(false);
            trigger.current?.focus();
          }}
          className="rental-calendar border-deep-teal/15 text-deep-teal backdrop:bg-deep-teal/45 m-auto max-h-[90dvh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-[1.75rem] border bg-[#FAF7F0] p-5 shadow-2xl backdrop:backdrop-blur-sm sm:p-6"
        >
          {panel}
        </dialog>
      )}
    </div>
  );
}
