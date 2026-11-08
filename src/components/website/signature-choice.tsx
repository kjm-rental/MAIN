"use client";
import { useRef, useState } from "react";
import { SignaturePad } from "./signature-pad";
import type { SignatureStrokes } from "@/lib/electronic-signature";
export function SignatureChoice({
  method,
  onMethod,
  strokes,
  onStrokes,
  image,
  onImage,
  readOnly = false,
}: {
  method: "drawn" | "uploaded";
  onMethod: (method: "drawn" | "uploaded") => void;
  strokes: SignatureStrokes;
  onStrokes: (value: SignatureStrokes) => void;
  image: string;
  onImage: (value: string) => void;
  readOnly?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function choose(file?: File) {
    if (!file) return;
    const current = ++selection.current;
    setError("");
    onImage("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8_388_608 ||
      !file.size
    ) {
      setError("Choose a PNG, JPG or WebP signature image up to 8 MB.");
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const photo = new Image();
      photo.src = url;
      await photo.decode();
      const scale = Math.min(
        1,
        1000 / photo.naturalWidth,
        400 / photo.naturalHeight,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw Error("Image preview unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      const normalized = canvas.toDataURL("image/png");
      if (normalized.length > 1_500_000)
        throw Error("Choose a smaller image of just your signature.");
      if (current === selection.current) onImage(normalized);
    } catch {
      if (current === selection.current)
        setError(
          "This image could not be opened. Choose a clear PNG or JPG of your signature.",
        );
    } finally {
      URL.revokeObjectURL(url);
      if (current === selection.current) setLoading(false);
    }
  }
  if (readOnly)
    return (
      <div
        className="border-deep-teal/15 mt-4 rounded-2xl border bg-white p-4"
        style={{ touchAction: "pan-y" }}
      >
        <p className="text-deep-teal text-sm font-bold">Your saved signature</p>
        {method === "uploaded" ? (
          /* Private inline preview, never sent to an image proxy. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image}
            alt="Your saved signature"
            className="mx-auto mt-3 max-h-36 max-w-full object-contain"
          />
        ) : (
          <svg
            role="img"
            aria-label="Your saved drawn signature"
            viewBox="0 0 600 180"
            className="mx-auto mt-3 max-h-36 w-full max-w-lg"
          >
            {strokes.map((stroke, index) => (
              <polyline
                key={index}
                points={stroke
                  .map((p) => `${p.x * 600},${p.y * 180}`)
                  .join(" ")}
                fill="none"
                stroke="#153f40"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}
        <p className="text-muted mt-2 text-xs">
          Saved with your accepted rental terms.
        </p>
      </div>
    );
  return (
    <div className="mt-5">
      <h4 className="text-deep-teal font-bold">Your signature</h4>
      <p className="text-muted mt-1 text-sm">
        Choose how you would like to sign.
      </p>
      <div
        className="mt-3 grid grid-cols-2 gap-2"
        role="group"
        aria-label="Signature method"
      >
        {(
          [
            ["drawn", "Draw signature"],
            ["uploaded", "Upload image"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={method === value}
            onClick={() => onMethod(value)}
            className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-bold ${method === value ? "bg-deep-teal border-deep-teal text-white" : "border-deep-teal/20 text-deep-teal bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {method === "drawn" ? (
        <SignaturePad value={strokes} onChange={onStrokes} />
      ) : (
        <div className="border-deep-teal/15 mt-4 rounded-2xl border bg-white p-5">
          <p className="text-muted text-sm leading-6">
            Upload a clear image of your signature, or sign on plain white paper
            and take a photo. PNG, JPG or WebP · Up to 8 MB.
          </p>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Upload your signature image"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {image && (
            <div className="border-deep-teal/20 mt-4 rounded-xl border bg-white p-3">
              {/* Private local preview; never sent to an image proxy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Your uploaded signature"
                className="mx-auto max-h-40 max-w-full object-contain"
              />
            </div>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => input.current?.click()}
            className="bg-deep-teal mt-4 min-h-12 w-full rounded-xl px-4 py-3 font-bold text-white"
          >
            {loading
              ? "Preparing image…"
              : image
                ? "Replace signature image"
                : "Choose signature image"}
          </button>
          {image && (
            <button
              type="button"
              onClick={() => {
                ++selection.current;
                onImage("");
                setError("");
              }}
              className="text-ocean mt-2 min-h-11 w-full text-sm underline"
            >
              Remove image
            </button>
          )}
          <p className="text-muted mt-3 text-sm leading-6">
            By uploading my signature and confirming this booking, I
            electronically sign the rental agreement and agree to the Terms and
            Conditions below.
          </p>
          <p role="status" className="text-ocean mt-2 text-sm">
            {image
              ? "Signature image ready."
              : "Signature image required before confirming."}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
