"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
export function VerificationResubmission({
  bookingId,
  documents,
  instructions,
}: {
  bookingId: string;
  documents: { document_kind: string }[];
  instructions: string | null;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const kinds = [...new Set(documents.map((d) => d.document_kind))];
  async function upload(kind: string, file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      if (
        file.size < 1 ||
        file.size > 8388608 ||
        ![
          "image/avif",
          "image/webp",
          "image/jpeg",
          "image/png",
          "application/pdf",
        ].includes(file.type)
      )
        throw new Error("Use an image or PDF no larger than 8 MB.");
      const client = createClient(),
        {
          data: { user },
          error,
        } = await client.auth.getUser();
      if (error || !user)
        throw new Error("Sign in with the customer account for this booking.");
      const path = `${user.id}/${bookingId}/${crypto.randomUUID()}.${file.type === "application/pdf" ? "pdf" : "image"}`;
      const saved = await client.storage
        .from("identity-verification")
        .upload(path, file, { contentType: file.type });
      if (saved.error) throw new Error(saved.error.message);
      const registered = await client.rpc(
        "register_verification_resubmission",
        {
          p_booking_id: bookingId,
          p_document_kind: kind,
          p_storage_path: path,
          p_mime_type: file.type,
          p_size_bytes: file.size,
        },
      );
      if (registered.error) throw new Error(registered.error.message);
      void fetch(`/api/verification/${bookingId}/prescreen`, {
        method: "POST",
        keepalive: true,
      }).catch(() => undefined);
      setMessage(
        "Corrected document received. Manual verification is still required.",
      );
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The corrected document could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border-deep-teal/15 mt-6 rounded-2xl border p-5">
      <h2 className="text-xl font-bold">Document corrections requested</h2>
      <p className="text-muted mt-3 text-sm">
        {instructions ?? "Replace the documents requested by KJM."}
      </p>
      <div className="mt-4 space-y-4">
        {kinds.map((kind) => (
          <label key={kind} className="block text-sm font-bold capitalize">
            {kind.replaceAll("_", " ")}
            <input
              type="file"
              disabled={busy}
              accept="image/avif,image/webp,image/jpeg,image/png,application/pdf"
              onChange={(e) => void upload(kind, e.target.files?.[0])}
              className="mt-2 block w-full text-xs"
            />
          </label>
        ))}
      </div>
      <p role="status" className="text-muted mt-3 text-sm">
        {busy ? "Uploading corrected private document…" : message}
      </p>
    </section>
  );
}
