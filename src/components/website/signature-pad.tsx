"use client";

import { useRef, type PointerEvent } from "react";
import type { SignatureStrokes } from "@/lib/electronic-signature";

export function SignaturePad({
  value,
  onChange,
}: {
  value: SignatureStrokes;
  onChange: (value: SignatureStrokes) => void;
}) {
  const active = useRef<{
    pointerId: number;
    strokes: SignatureStrokes;
  } | null>(null);
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    const strokes = active.current.strokes.filter(
      (stroke) => stroke.length > 1,
    );
    active.current = null;
    onChange(strokes);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div className="border-deep-teal/15 mt-5 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 id="signature-pad-label" className="text-deep-teal font-bold">
          Draw your signature
        </h4>
        <button
          type="button"
          className="text-ocean min-h-11 px-3 text-sm font-bold underline"
          onClick={() => {
            active.current = null;
            onChange([]);
          }}
          disabled={!value.length}
        >
          Clear signature
        </button>
      </div>
      <p id="signature-pad-help" className="text-muted mb-3 text-sm">
        Sign in the box using your mouse, finger, or stylus.
      </p>
      <svg
        role="img"
        aria-labelledby="signature-pad-label"
        aria-describedby="signature-pad-help"
        viewBox="0 0 600 180"
        preserveAspectRatio="none"
        className="border-deep-teal/20 h-48 w-full rounded-xl border bg-white"
        style={{ touchAction: "none", cursor: "crosshair" }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || value.length >= 100)
            return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const strokes = [...value, [position(event)]];
          active.current = { pointerId: event.pointerId, strokes };
          onChange(strokes);
        }}
        onPointerMove={(event) => {
          const drawing = active.current;
          if (!drawing || drawing.pointerId !== event.pointerId) return;
          const last = drawing.strokes[drawing.strokes.length - 1];
          if (last.length >= 2000) return;
          const strokes = [
            ...drawing.strokes.slice(0, -1),
            [...last, position(event)],
          ];
          active.current = { pointerId: event.pointerId, strokes };
          onChange(strokes);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      >
        {value.length === 0 && (
          <text
            x="300"
            y="98"
            textAnchor="middle"
            fill="#7a8c85"
            fontSize="18"
            pointerEvents="none"
          >
            Sign here
          </text>
        )}
        {value.map((stroke, index) => (
          <polyline
            key={index}
            points={stroke
              .map((point) => `${point.x * 600},${point.y * 180}`)
              .join(" ")}
            fill="none"
            stroke="#153f40"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}
      </svg>
      <p className="text-muted mt-3 text-sm leading-6">
        By drawing my signature, I electronically sign the rental agreement and
        agree to the Terms and Conditions below. No signed document upload is
        needed.
      </p>
      <p role="status" className="text-ocean mt-2 text-sm">
        {value.some((stroke) => stroke.length > 1)
          ? "Signature added. Clear to sign again."
          : "Signature required before confirming."}
      </p>
    </div>
  );
}
