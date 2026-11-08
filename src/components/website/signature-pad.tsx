"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  signatureStrokesSchema,
  type SignatureStrokes,
} from "@/lib/electronic-signature";

function Ink({ value }: { value: SignatureStrokes }) {
  return value.map((stroke, index) => (
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
  ));
}
export function SignaturePad({
  value,
  onChange,
}: {
  value: SignatureStrokes;
  onChange: (value: SignatureStrokes) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const original = useRef<SignatureStrokes>([]);
  const active = useRef<{
    pointerId: number;
    strokes: SignatureStrokes;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const valid = signatureStrokesSchema.safeParse(value).success;
  useEffect(() => {
    if (!editing) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [editing]);
  function open() {
    original.current = value;
    active.current = null;
    if (dialog.current) {
      dialog.current.returnValue = "";
      dialog.current.showModal();
      setEditing(true);
    }
  }
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
    <div className="border-deep-teal/15 mt-5 rounded-2xl border bg-white p-4 sm:p-5">
      <p className="text-muted mb-3 text-sm leading-6">
        Tap the box to sign. You can scroll over this preview without drawing.
      </p>
      <button
        ref={trigger}
        type="button"
        onClick={open}
        className="border-deep-teal/20 block w-full overflow-hidden rounded-xl border bg-white text-left"
        aria-label={valid ? "Edit your drawn signature" : "Open signature box"}
        aria-haspopup="dialog"
        style={{ touchAction: "pan-y" }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 600 180"
          className="h-36 w-full"
          preserveAspectRatio="none"
        >
          {value.length ? (
            <Ink value={value} />
          ) : (
            <text
              x="300"
              y="98"
              textAnchor="middle"
              fill="#617b77"
              fontSize="22"
            >
              Tap to sign here
            </text>
          )}
        </svg>
        <span className="bg-deep-teal/5 text-ocean block px-4 py-3 text-center text-sm font-bold">
          {valid ? "Edit signature" : "Sign here"}
        </span>
      </button>
      <p role="status" className="text-ocean mt-3 text-sm">
        {valid ? "Signature added." : "Signature required before confirming."}
      </p>
      <p className="text-muted mt-3 text-sm leading-6">
        By adding my signature and confirming this booking, I electronically
        sign the rental agreement and agree to the Terms and Conditions below.
      </p>
      <dialog
        ref={dialog}
        aria-labelledby="signature-dialog-title"
        className="text-deep-teal m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-5 shadow-2xl backdrop:bg-black/50"
        onClose={() => {
          active.current = null;
          setEditing(false);
          if (dialog.current?.returnValue !== "save")
            onChange(original.current);
          trigger.current?.focus();
        }}
      >
        <h3 id="signature-dialog-title" className="text-xl font-bold">
          Draw your signature
        </h3>
        <p
          id="signature-dialog-help"
          className="text-muted mt-2 text-sm leading-6"
        >
          Sign below with your finger, mouse or stylus. Tap Done to save and
          return to your booking.
        </p>
        <svg
          role="img"
          aria-label="Signature drawing area"
          aria-describedby="signature-dialog-help"
          viewBox="0 0 600 180"
          preserveAspectRatio="none"
          className="border-deep-teal/30 my-4 h-48 w-full rounded-xl border bg-white sm:h-56"
          style={{ touchAction: "none", cursor: "crosshair" }}
          onPointerDown={(event) => {
            if (
              !editing ||
              !event.isPrimary ||
              event.button !== 0 ||
              value.length >= 100
            )
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
          {!value.length && (
            <text
              x="300"
              y="98"
              textAnchor="middle"
              fill="#7a8c85"
              fontSize="20"
              pointerEvents="none"
            >
              Sign here
            </text>
          )}
          <Ink value={value} />
        </svg>
        <button
          type="button"
          disabled={!value.length}
          className="text-ocean mb-3 min-h-11 px-2 text-sm font-bold underline disabled:opacity-40"
          onClick={() => {
            active.current = null;
            onChange([]);
          }}
        >
          Clear signature
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="border-deep-teal/20 min-h-12 rounded-xl border px-4 py-3 font-bold"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            className="bg-deep-teal min-h-12 rounded-xl px-4 py-3 font-bold text-white disabled:opacity-40"
            onClick={() => dialog.current?.close("save")}
          >
            Done
          </button>
        </div>
      </dialog>
    </div>
  );
}
