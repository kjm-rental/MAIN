"use client";

import { Check, Palette } from "lucide-react";
import "./motorcycle-color-options.css";

export type MotorcycleColorOption = { color: string; available_count: number };

const swatches: Record<string, string> = {
  black: "#252a2b",
  white: "#f6f5ef",
  red: "#b94540",
  blue: "#47739c",
  gray: "#8a9093",
  grey: "#8a9093",
  green: "#627e64",
  yellow: "#dfbd58",
  brown: "#8b6954",
  orange: "#d58b53",
  silver: "#c7cccf",
  "matte black": "#383b3b",
};

function ColorSwatch({ color }: { color: string }) {
  const parts = color
    .toLowerCase()
    .split("/")
    .map((part) => swatches[part.trim()]);
  return (
    <span className="ride-color-swatch" aria-hidden="true">
      {parts.every(Boolean) ? (
        parts.map((hex, i) => <span key={i} style={{ backgroundColor: hex }} />)
      ) : (
        <Palette size={17} />
      )}
    </span>
  );
}

export function MotorcycleColorOptions({
  options,
  value,
  onChange,
  loading,
  error,
  disabled,
}: {
  options: MotorcycleColorOption[];
  value: string;
  onChange: (color: string) => void;
  loading: boolean;
  error: string;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled || loading} className="ride-color-picker">
      <legend className="ride-color-title">Make it your ride</legend>
      <div className="ride-color-heading">
        <p>Choose your color</p>
        <span>{value ? "Color selected" : "Select one"}</span>
      </div>
      {loading ? (
        <p role="status" className="ride-color-note">
          Checking colors for your dates…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : options.length ? (
        <div className="ride-color-grid">
          {options.map((option) => {
            const selected = value === option.color;
            const unavailable = option.available_count < 1;
            return (
              <label
                key={option.color}
                className={`ride-color-card ${selected ? "is-selected" : ""} ${unavailable ? "is-unavailable" : ""}`}
              >
                <input
                  type="radio"
                  name="motorcycle-color"
                  value={option.color}
                  checked={selected}
                  disabled={unavailable}
                  onChange={() => onChange(option.color)}
                />
                <ColorSwatch color={option.color} />
                <span className="ride-color-name">
                  {option.color}
                  <small>
                    {unavailable
                      ? "Unavailable"
                      : selected
                        ? "Your selection"
                        : "Available"}
                  </small>
                </span>
                <span className="ride-color-check" aria-hidden="true">
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="ride-color-note">
          Colors have not been configured for this model. You can continue
          without a color preference.
        </p>
      )}
      {!loading && !error && options.length > 0 && !value && (
        <p role="status" className="ride-color-note">
          Choose an available color. If your dates change, you may need to
          select another.
        </p>
      )}
      <p className="ride-color-caption">
        Swatches are a guide. Model photos may show a different color.
      </p>
    </fieldset>
  );
}
