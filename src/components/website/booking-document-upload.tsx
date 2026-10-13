"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Camera, Upload, Check, Maximize2, X } from "lucide-react";
import {
  DOCUMENT_ACCEPT,
  documentFileError,
} from "@/lib/booking-document-file";
export function BookingDocumentUpload({
  label,
  file,
  onChange,
  required = false,
}: {
  label: string;
  file?: File;
  onChange: (file: File | undefined) => void;
  required?: boolean;
}) {
  const id = useId(),
    choose = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    image = useRef<HTMLImageElement>(null),
    large = useRef<HTMLImageElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    enlarge = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file?.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    if (image.current) image.current.src = url;
    if (large.current) large.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(next?: File) {
    if (!next) return;
    const message = documentFileError(next);
    setError(message);
    if (!message) onChange(next);
  }
  return (
    <section className="minimal-upload" aria-labelledby={`${id}-title`}>
      <div className="minimal-upload-heading">
        <h3 id={`${id}-title`}>{label}</h3>
        <span>{required ? "Required" : "Optional"}</span>
      </div>
      <input
        ref={choose}
        id={`${id}-file`}
        aria-label={label}
        type="file"
        accept={DOCUMENT_ACCEPT}
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
        tabIndex={-1}
      />
      <input
        ref={camera}
        aria-label={`Take photo of ${label}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
        tabIndex={-1}
      />
      {file?.type.startsWith("image/") && (
        <button
          ref={enlarge}
          type="button"
          className="minimal-upload-preview"
          aria-label={`Enlarge ${label}`}
          onClick={() => dialog.current?.showModal()}
        >
          {/* Local in-memory blob; never passed to an image proxy. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={image} alt={`${label} preview`} />
          <span>
            <Maximize2 size={14} /> Enlarge
          </span>
        </button>
      )}
      <div className="minimal-upload-actions">
        <button type="button" onClick={() => camera.current?.click()}>
          <Camera size={16} />
          Take Photo
        </button>
        <button type="button" onClick={() => choose.current?.click()}>
          <Upload size={16} />
          {file ? "Replace File" : "Choose File"}
        </button>
      </div>
      <p className="minimal-upload-help">
        {file ? (
          <>
            <Check size={14} />
            <span>{file.name} · Ready for secure upload</span>
          </>
        ) : (
          "Image or PDF · Up to 8 MB"
        )}
      </p>
      {error && (
        <p role="alert" className="minimal-upload-error">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="minimal-document-dialog"
        aria-label={`${label} enlarged preview`}
        onClose={() => enlarge.current?.focus()}
      >
        <button
          type="button"
          aria-label="Close document preview"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={large} alt={`${label} enlarged preview`} />
      </dialog>
    </section>
  );
}
