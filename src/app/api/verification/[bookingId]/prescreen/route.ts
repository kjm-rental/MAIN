import { recognizeDocument } from "@/lib/document-ocr";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { screenDocuments } from "@/lib/document-prescreen";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const respond = (status: number, data: unknown) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return respond(403, { error: "Forbidden" });
  const id = z.uuid().safeParse((await params).bookingId);
  if (!id.success) return respond(400, { error: "Invalid request" });
  try {
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user)
      return respond(401, { error: "Sign in required" });
    const booking = await client
      .from("bookings")
      .select("customer_id,start_at")
      .eq("id", id.data)
      .maybeSingle();
    if (booking.error || !booking.data)
      return respond(404, { error: "Booking unavailable" });
    const customer = await client
      .from("customers")
      .select("auth_user_id,full_name")
      .eq("id", booking.data.customer_id)
      .maybeSingle();
    if (customer.error || customer.data?.auth_user_id !== auth.data.user.id)
      return respond(404, { error: "Booking unavailable" });
    const [verification, documents] = await Promise.all([
      client
        .from("customer_verifications")
        .select(
          "customer_type,identity_name,license_name,license_expiration_date,permitted_vehicle_categories",
        )
        .eq("booking_id", id.data)
        .maybeSingle(),
      client
        .from("verification_documents")
        .select(
          "id,document_kind,mime_type,size_bytes,replaced_at,storage_path,owner_user_id",
        )
        .eq("booking_id", id.data)
        .is("replaced_at", null)
        .order("created_at", { ascending: false })
        .limit(13),
    ]);
    if (verification.error || !verification.data || documents.error)
      return respond(503, {
        error: "Pre-screening unavailable; manual review remains required",
      });
    const v = verification.data;
    const result = await screenDocuments({
      ocr: recognizeDocument,
      documents: documents.data ?? [],
      customerType: v.customer_type,
      customerName: customer.data!.full_name,
      identityName: v.identity_name,
      licenseName: v.license_name,
      licenseExpiry: v.license_expiration_date,
      categories: v.permitted_vehicle_categories,
      pickupAt: booking.data.start_at,
      load: async (document) => {
        const stored = documents.data?.find((item) => item.id === document.id);
        if (!stored || stored.owner_user_id !== auth.data.user!.id)
          throw new Error("Unavailable");
        const download = await client.storage
          .from("identity-verification")
          .download(stored.storage_path);
        if (download.error || !download.data || download.data.size > 8388608)
          throw new Error("Unavailable");
        return new Uint8Array(await download.data.arrayBuffer());
      },
    });
    // Advisory only: no verification statuses, audits or booking data are mutated.
    return respond(200, { status: result.status, checkedAt: result.checkedAt });
  } catch {
    return respond(503, {
      error: "Pre-screening unavailable; manual review remains required",
    });
  }
}
