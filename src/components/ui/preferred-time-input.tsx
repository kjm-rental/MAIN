"use client";
import { useState } from "react";
import { preferredTime24, preferredTimeParts } from "@/lib/preferred-time";
export function PreferredTimeInput({
  label,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  describedBy: string;
}) {
  const [parts, setParts] = useState(() => preferredTimeParts(value));
  const invalidHour =
    parts.hour !== "" && (Number(parts.hour) < 1 || Number(parts.hour) > 12);
  const invalidMinute = parts.minute !== "" && Number(parts.minute) > 59;
  function update(patch: Partial<typeof parts>) {
    const next = { ...parts, ...patch };
    setParts(next);
    onChange(preferredTime24(next.hour, next.minute, next.period));
  }
  return (
    <fieldset
      className="rental-preferred-time"
      disabled={disabled}
      aria-describedby={describedBy}
    >
      <legend>{label}</legend>
      <div className="rental-time-entry">
        <div className="rental-time-digits">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={`${label} hour`}
            aria-invalid={invalidHour}
            maxLength={2}
            placeholder="HH"
            value={parts.hour}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              update({ hour: e.target.value.replace(/\D/g, "") })
            }
            onBlur={() => {
              if (parts.hour && !invalidHour)
                setParts((p) => ({ ...p, hour: p.hour.padStart(2, "0") }));
            }}
          />
          <span aria-hidden="true">:</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={`${label} minute`}
            aria-invalid={invalidMinute}
            maxLength={2}
            placeholder="MM"
            value={parts.minute}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              update({ minute: e.target.value.replace(/\D/g, "") })
            }
            onBlur={() => {
              if (parts.minute && !invalidMinute)
                setParts((p) => ({ ...p, minute: p.minute.padStart(2, "0") }));
            }}
          />
        </div>
        <div
          className="rental-time-period"
          role="group"
          aria-label={`${label} AM or PM`}
        >
          {(["AM", "PM"] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={parts.period === period}
              onClick={() => update({ period })}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      {(invalidHour || invalidMinute) && (
        <p role="alert" className="text-xs font-normal text-red-700">
          {invalidHour
            ? "Enter an hour from 1 to 12."
            : "Enter minutes from 00 to 59."}
        </p>
      )}
    </fieldset>
  );
}
