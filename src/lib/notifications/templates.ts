import { rentalDuration } from "@/lib/rental-duration";
import { rentalPricingSchema, rentalPricingRows } from "@/lib/rental-pricing";
import { z } from "zod";

export const BRAND = {
  from: "KJM Motorcycle Rental <booking@kjmride.com>",
  reply: "kjm.moto.rental@gmail.com",
  admin: "kjm.moto.rental@gmail.com",
  site: "https://kjmride.com",
} as const;
export const messages = {
  booking_requested: [
    "Booking Request Received",
    "Your booking request has been received and is pending administrator approval. It is not yet confirmed.",
  ],
  booking_approved: [
    "Booking Confirmed",
    "Your booking is confirmed. Identity verification is separate. Successful verification and all pickup requirements must be completed before motorcycle handover.",
  ],
  booking_rejected: [
    "Booking Rejected",
    "Your booking request was declined. Contact us if you need help with another booking.",
  ],
  booking_cancelled: [
    "Booking Cancelled",
    "Your booking has been cancelled. Contact us for assistance with the cancellation.",
  ],
  pickup_reminder: [
    "Pickup Reminder",
    "Your confirmed motorcycle pickup is approaching.",
  ],
  pickup_instructions: [
    "Pickup Instructions",
    "Please follow the pickup information below.",
  ],
  handover: [
    "Motorcycle Handover Confirmation",
    "The motorcycle handover has been recorded.",
  ],
  return_reminder: [
    "Return Reminder",
    "Your scheduled motorcycle return is approaching.",
  ],
  rental_completed: [
    "Rental Completed",
    "Your motorcycle has been returned and your rental is marked completed. Thank you for riding with KJM.",
  ],
  deposit_returned: [
    "Security Deposit Returned",
    "An administrator has recorded the security deposit return shown below.",
  ],
  booking_modified: [
    "Booking Modification",
    "Your confirmed booking details have changed. Your updated details are shown below.",
  ],
  review_request: [
    "Thank You & Review Request",
    "Thank you for renting with KJM Motorcycle Rental. We would appreciate your feedback.",
  ],
  verification_approved: [
    "Identity Verification Approved",
    "Your identification verification has been approved. Your booking status is separate, and all remaining pickup requirements still apply.",
  ],
  document_checks_passed: [
    "Document Checks Passed",
    "Your automatic preliminary document checks passed. This does not verify identity authenticity, ownership or motorcycle license eligibility. Your booking remains separate; authorized identity approval and all handover requirements still apply.",
  ],
  verification_review: [
    "Documents Received",
    "Your private documents have been received for review. This is not identity approval. Follow your verification progress securely in your booking.",
  ],
  verification_manual_review: [
    "Identity Review in Progress",
    "KJM needs to review your documents and motorcycle license eligibility. This is not a rejection or approval. We will let you know if corrections are needed.",
  ],
  verification_rejected: [
    "Identity Verification Rejected",
    "Your identification documents were rejected. Contact KJM for guidance on the next steps. Do not reply with identity documents by email.",
  ],
  verification_action: [
    "Additional Documents Required",
    "Your documents require correction or resubmission. Sign in to your booking to view the next steps securely.",
  ],
  admin_booking_requested: [
    "New Booking",
    "A new booking has been saved. Check its booking status and identity verification status separately in the secure administrative system.",
  ],
  admin_booking_cancelled: [
    "Booking Cancellation",
    "A booking has been cancelled.",
  ],
  admin_booking_modified: [
    "Booking Modification",
    "Confirmed booking details have changed.",
  ],
  admin_pickup_reminder: [
    "Upcoming Motorcycle Pickup",
    "A confirmed motorcycle pickup is approaching.",
  ],
  admin_return_reminder: [
    "Upcoming Motorcycle Return",
    "An active rental is approaching its return time.",
  ],
  admin_overdue: [
    "Overdue Motorcycle Return",
    "An active rental is past its scheduled return time.",
  ],
  admin_verification_review: [
    "Customer Documents Submitted",
    "Documents were submitted. Review them only in the secure administrative system.",
  ],
  admin_manual_review: [
    "Manual Review Required",
    "A booking or identity verification requires manual review.",
  ],
  payment_successful: [
    "Online Payment Successful",
    "Your online payment was successful.",
  ],
  payment_failed: [
    "Online Payment Failed",
    "Your online payment did not succeed.",
  ],
  payment_refunded: [
    "Online Payment Refunded",
    "Your online payment refund has been recorded.",
  ],
  payment_pending: [
    "Online Payment Pending",
    "Your online payment is pending.",
  ],
} as const;
export type Template = keyof typeof messages;
const serviceLeg = z.object({
  address: z.string().max(500),
  areaName: z.string().max(120).optional(),
  hotel: z.string().max(150).optional(),
  landmark: z.string().max(150).optional(),
  instructions: z.string().max(500).optional(),
  scheduledAt: z.iso.datetime({ offset: true }),
});
export const payloadSchema = z
  .object({
    bookingId: z.uuid(),
    guestCheckout: z.boolean().optional(),
    delivery: serviceLeg.nullable().optional(),
    collection: serviceLeg.nullable().optional(),
    deliveryFeeCentavos: z.number().int().nonnegative().optional(),
    collectionFeeCentavos: z.number().int().nonnegative().optional(),
    paymentMethod: z.enum(["cash", "qrph"]).optional(),
    paymentStatus: z.enum(["paid", "unpaid"]).optional(),
    reference: z.string().min(1).max(100),
    motorcycle: z.string().min(1).max(200),
    pickupAt: z.iso.datetime({ offset: true }),
    returnAt: z.iso.datetime({ offset: true }),
    rentalCentavos: z.number().int().nonnegative(),
    rentalPricing: rentalPricingSchema.nullable().optional(),
    depositOption: z.enum(["cash", "eligible_id", "unconfirmed"]).optional(),
    depositCentavos: z.number().int().nonnegative().nullable().optional(),
    amountCentavos: z.number().int().nonnegative().nullable().optional(),
    customerName: z.string().trim().min(1).max(160).optional(),
    motorcycleImageUrl: z.string().max(2048).optional(),
    pickupLocation: z.string().max(1000).optional(),
    pickupInstructions: z.string().max(2000).optional(),
    customerExplanation: z.string().max(2000).optional(),
  })
  .refine(
    (p) => Date.parse(p.returnAt) > Date.parse(p.pickupAt),
    "Invalid rental period",
  );
export type Payload = z.infer<typeof payloadSchema>;
export function escapeHTML(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function manila(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
const money = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    n / 100,
  );
function safeURL(value?: string) {
  if (!value) return undefined;
  const u = new URL(value);
  if (
    (u.protocol !== "https:" &&
      !(
        process.env.NODE_ENV === "development" &&
        u.protocol === "http:" &&
        u.hostname === "localhost" &&
        ["3000", "3001"].includes(u.port)
      )) ||
    u.username ||
    u.password
  )
    throw new Error("Invalid configured link");
  return u.href;
}
// Public, existing project-owned assets. Do not substitute customer documents or
// generated scenery for an actual booked motorcycle image.
export const EMAIL_ASSETS = {
  logo: `${BRAND.site}/images/brand/kjm-logo.png`,
  scenic: `${BRAND.site}/images/island/cebu-coastal-ride-v2.webp`,
} as const;

function motorcyclePhoto(value?: string) {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      /%2e|%2f|%5c|%25/i.test(u.pathname)
    )
      return undefined;
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : undefined;
    const catalogue =
      u.origin === origin &&
      u.pathname.startsWith("/storage/v1/object/public/motorcycle-catalog/");
    const projectImage =
      u.origin === BRAND.site && u.pathname.startsWith("/images/motorcycles/");
    return catalogue || projectImage ? u.href : undefined;
  } catch {
    return undefined;
  }
}
const bodyFont = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
const headingFont = "Outfit,'Trebuchet MS',Arial,sans-serif";
const e = escapeHTML;
function notice(title: string, copy: string, tone = "sand") {
  const background = tone === "green" ? "#edf6f0" : "#fff5d7";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px"><tr><td style="padding:17px;background:${background};border-radius:12px;color:#153f40"><strong style="font-size:14px">${e(title)}</strong><p style="margin:7px 0 0;font-size:13px;line-height:1.7">${e(copy)}</p></td></tr></table>`;
}
function steps(items: [string, string][]) {
  return `<h2 style="font-family:${headingFont};font-size:22px;line-height:1.3;margin:24px 0 14px">What’s next?</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(([title, copy], i) => `<tr><td width="42" valign="top" style="padding:4px 12px 16px 0"><span style="display:inline-block;width:30px;line-height:30px;text-align:center;border-radius:50%;background:#277b37;color:white;font-weight:bold">${i + 1}</span></td><td style="padding:3px 0 18px"><strong style="font-size:14px">${e(title)}</strong><p style="margin:5px 0 0;font-size:13px;line-height:1.7;color:#466261">${e(copy)}</p></td></tr>`).join("")}</table>`;
}
export function render(
  template: Template,
  input: unknown,
  links: { review?: string; admin?: string; app?: string } = {},
) {
  const p = payloadSchema.parse(input);
  if (
    template === "pickup_instructions" &&
    (!p.pickupLocation || !p.pickupInstructions)
  )
    throw new Error("Pickup information unavailable");
  const review =
    template === "review_request" ? safeURL(links.review) : undefined;
  const isAdmin = template.startsWith("admin_");
  const admin = isAdmin ? safeURL(links.admin) : undefined;
  // Guest links contain no access token; the original HttpOnly browser cookie is still required.
  const bookingURL = `${safeURL(links.app) || BRAND.site}/${p.guestCheckout ? "guest/booking" : "booking/status"}/${p.bookingId}`;
  const deposit =
    p.depositOption === "cash" && p.depositCentavos != null
      ? `${money(p.depositCentavos)}, collected separately in cash at pickup`
      : p.depositOption === "eligible_id"
        ? "Eligible ID deposit arrangement recorded; see your secure booking for requirements."
        : "See your secure booking for the recorded deposit arrangement.";
  const [title, intro] = messages[template];
  const heading =
    template === "booking_approved"
      ? "Your Ride Is Confirmed!"
      : template === "admin_manual_review"
        ? "Verification Requires Review"
        : title;
  const isVerification = template.startsWith("verification_");
  const isPickup = [
    "pickup_reminder",
    "pickup_instructions",
    "admin_pickup_reminder",
  ].includes(template);
  const warning =
    template.includes("rejected") ||
    template.includes("cancelled") ||
    template.includes("overdue") ||
    template.includes("failed");
  const attention =
    template.includes("reminder") ||
    template === "booking_requested" ||
    template === "admin_verification_review" ||
    template === "admin_manual_review" ||
    template === "payment_pending" ||
    template === "verification_action";
  const symbol = warning ? "!" : attention ? "&#9679;" : "&#10003;";
  const badgeBg = warning ? "#fae9e3" : attention ? "#fff0b5" : "#e2f2e2";
  const badgeInk = warning ? "#8b3827" : attention ? "#71520d" : "#277b37";
  const subtitle =
    template === "booking_approved"
      ? "Thank you for choosing KJM Motorcycle Rental."
      : isVerification
        ? "A clear next step for your Cebu ride."
        : isPickup
          ? "Your Cebu adventure starts soon."
          : isAdmin
            ? "Your KJM operations update."
            : "Your next update from KJM Motorcycle Rental.";
  const rows: [string, string][] = [
    ...(p.customerName
      ? [["Customer", p.customerName] as [string, string]]
      : []),
    ["Booking reference", p.reference],
    ["Motorcycle", p.motorcycle],
    ["Pickup (Asia/Manila)", manila(p.pickupAt)],
    ["Return (Asia/Manila)", manila(p.returnAt)],
    [
      "Rental duration",
      rentalDuration(p.pickupAt, p.returnAt)?.label ?? "See rental dates",
    ],
    ...rentalPricingRows(p.rentalPricing),
    ["Rental amount", money(p.rentalCentavos)],
    [
      "Payment method",
      p.paymentMethod === "qrph"
        ? "QRPh via PayMongo"
        : p.delivery
          ? "Cash on Delivery"
          : "Cash on Pickup",
    ],
    ...(p.paymentStatus
      ? [["Payment status", p.paymentStatus] as [string, string]]
      : []),
    ["Refundable security deposit", deposit],
  ];
  if (p.delivery || p.collection) {
    rows.push(
      [
        "Delivery",
        p.delivery
          ? `${p.delivery.areaName ?? ""} · ${p.delivery.address} · ${manila(p.delivery.scheduledAt)}`
          : "Self pickup at KJM",
      ],
      [
        "Collection",
        p.collection
          ? `${p.collection.areaName ?? ""} · ${p.collection.address} · ${manila(p.collection.scheduledAt)}`
          : "Self return to KJM",
      ],
      ["Delivery fee", money(p.deliveryFeeCentavos ?? 0)],
      ["Collection fee", money(p.collectionFeeCentavos ?? 0)],
      ["Rental/services total", money(p.rentalCentavos)],
    );
  }
  if (template === "deposit_returned") {
    if (!p.amountCentavos) throw new Error("Missing recorded deposit return");
    rows.push(["Deposit amount returned", money(p.amountCentavos)]);
  }
  const locationRows: [string, string][] = [];
  if (isPickup) {
    if (p.pickupLocation)
      locationRows.push(["Pickup location", p.pickupLocation]);
    if (p.pickupInstructions)
      locationRows.push(["Pickup instructions", p.pickupInstructions]);
    rows.push(...locationRows);
  }
  const explanation =
    p.customerExplanation &&
    [
      "booking_rejected",
      "booking_cancelled",
      "verification_action",
      "verification_rejected",
    ].includes(template)
      ? p.customerExplanation
      : undefined;
  if (explanation) rows.push(["Details", explanation]);
  const action = isAdmin
    ? admin
      ? ["Open secure administration", admin]
      : ["Visit KJM", BRAND.site]
    : review
      ? ["Leave a review", review]
      : ["View Your Booking", bookingURL];
  const photo = motorcyclePhoto(p.motorcycleImageUrl);
  const miniRow = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #e6ece8"><span style="font-size:11px;letter-spacing:.7px;text-transform:uppercase;color:#466261">${e(label)}</span><br><strong style="font-size:14px;line-height:1.7">${e(value)}</strong></td></tr>`;
  const reference = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0"><tr><td style="padding:14px 16px;background:#eaf4f7;border-radius:10px;overflow-wrap:anywhere"><span style="color:#466261;font-size:11px">Booking reference</span><br><strong style="font-size:16px;line-height:1.8">${e(p.reference)}</strong></td></tr></table>`;
  const motorcycle = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr>${photo ? `<td class="kjm-bike" width="40%" valign="middle" style="padding:0 20px 12px 0"><img src="${e(photo)}" alt="${e(p.motorcycle)} — booked model" width="190" style="display:block;width:100%;max-width:190px;height:auto;border:0"></td>` : ""}<td class="kjm-bike" valign="top"><p style="font-size:10px;letter-spacing:1.7px;color:#466261;margin:0 0 6px">${isAdmin ? "MOTORCYCLE" : "YOUR MOTORCYCLE"}</p><h2 style="font-family:${headingFont};font-size:22px;margin:0 0 10px;line-height:1.3;overflow-wrap:anywhere">${e(p.motorcycle)}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${miniRow("Pickup · Asia/Manila", manila(p.pickupAt))}${miniRow("Return · Asia/Manila", manila(p.returnAt))}${miniRow("Rental duration", rows.find(([k]) => k === "Rental duration")![1])}</table></td></tr></table>`;
  const price = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="padding:16px;background:#f2f5ef;border-radius:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="kjm-half" valign="middle"><span style="font-size:11px;color:#466261">Rental amount</span><br><strong style="font-size:28px;line-height:1.4;letter-spacing:-.5px">${e(money(p.rentalCentavos))}</strong></td><td class="kjm-half kjm-payment" align="right" valign="middle"><span style="display:inline-block;background:#ffefb2;border-radius:8px;padding:11px;font-size:12px;font-weight:bold;color:#4c3b14">${e(p.paymentMethod === "qrph" ? `QRPh · ${p.paymentStatus ?? "unpaid"}` : p.delivery ? "Cash on Delivery" : "Cash on Pickup")}</span></td></tr></table></td></tr></table><p style="font-size:13px;line-height:1.7;margin:17px 0 0"><strong>Refundable security deposit</strong><br>${e(deposit)}</p>`;
  let content = "";
  let additionalText = "";
  if (template === "verification_approved") {
    const next: [string, string][] = [
      [
        "Bring your original documents",
        "Bring the original identification and driver’s license documents required for your rental.",
      ],
      [
        p.paymentMethod === "qrph"
          ? "Check your QRPh payment"
          : "Prepare your cash payment",
        p.paymentMethod === "qrph"
          ? `Rental/services total: ${money(p.rentalCentavos)}. Verified payment status: ${p.paymentStatus ?? "unpaid"}. ${deposit}`
          : `Rental amount: ${money(p.rentalCentavos)}. ${deposit}`,
      ],
      [
        "Follow your pickup arrangements",
        "Check your scheduled pickup and contact KJM if you need the collection details.",
      ],
    ];
    content =
      steps(next) +
      notice(
        "Verification complete",
        "Your booking status is separate. All remaining payment, motorcycle inspection and physical handover requirements still apply.",
        "green",
      ) +
      `<div style="margin-top:22px">${motorcycle}</div>`;
    additionalText = `\n\nWhat’s next?\n${next.map(([a, b], i) => `${i + 1}. ${a}: ${b}`).join("\n")}`;
  } else {
    content =
      motorcycle +
      price +
      (p.rentalPricing
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rentalPricingRows(
            p.rentalPricing,
          )
            .map(([k, v]) => miniRow(k, v))
            .join("")}</table>`
        : "");
    if (isPickup && !isAdmin) {
      const bring = `Bring the required original identification and driver’s license documents, your booking reference, ${p.paymentMethod === "qrph" ? "and verified QRPh payment status" : "and the rental payment in cash"}. Deposit: ${deposit} Follow your agreed pickup time.`;
      content += notice("Please bring with you", bring);
      additionalText += `\n\nPlease bring with you\n${bring}`;
    }
    if (template === "booking_approved")
      content += notice(
        "Identity verification is separate",
        "Booking confirmation does not mean identity verification has passed. Complete successful verification and all pickup requirements before motorcycle handover.",
      );
  }
  if (locationRows.length)
    content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">${locationRows.map(([k, v]) => miniRow(k, v)).join("")}</table>`;
  if (explanation) content += notice("Next steps", explanation);
  if (template === "deposit_returned")
    content += notice(
      "Recorded deposit return",
      money(p.amountCentavos!),
      "green",
    );
  if (p.delivery || p.collection)
    content += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">${rows
      .filter(([key]) =>
        [
          "Delivery",
          "Collection",
          "Delivery fee",
          "Collection fee",
          "Rental/services total",
          "Payment method",
          "Payment status",
        ].includes(key),
      )
      .map(([key, value]) => miniRow(key, value))
      .join("")}</table>`;
  const text = `${heading}\n${heading === title ? "" : title + "\n"}\n${p.customerName ? "Hi " + p.customerName + ",\n\n" : ""}${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}${additionalText}\n\n${action[0]}: ${action[1]}\nContact: ${BRAND.reply}\nLapu-Lapu City, Cebu, Philippines\n${BRAND.site}`;
  const html = `<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${e(title)}</title><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><style>@media only screen and (max-width:480px){.kjm-shell{padding:10px!important}.kjm-content{padding:20px!important}.kjm-hero{padding:30px 22px!important}.kjm-title{font-size:32px!important}.kjm-half,.kjm-bike{display:block!important;width:100%!important;box-sizing:border-box!important}.kjm-payment{text-align:left!important;padding-top:10px!important}.kjm-location{display:none!important}}</style></head><body style="margin:0;padding:0;background:#f1e9db;color:#153f40;font-family:${bodyFont};-webkit-text-size-adjust:100%"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${e(title)} · ${e(p.reference)} · ${e(intro)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr><td class="kjm-shell" align="center" style="padding:28px 14px"><!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;table-layout:fixed;overflow-wrap:break-word;background:#ffffff;border-radius:16px"><tr><td style="padding:16px 24px;background:#ffffff;border-radius:16px 16px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="90"><a href="${BRAND.site}"><img src="${EMAIL_ASSETS.logo}" alt="KJM Motorcycle Rental" width="78" style="display:block;width:78px;height:auto;border:0"></a></td><td class="kjm-location" align="center" style="font-size:11px;line-height:1.5;color:#153f40">Lapu-Lapu City<br>Cebu, Philippines</td><td align="right" style="font-size:12px"><a href="${BRAND.site}" style="color:#153f40;text-decoration:none;font-weight:bold">kjmride.com</a></td></tr></table></td></tr><tr><td background="${EMAIL_ASSETS.scenic}" bgcolor="#153f40" style="background-color:#153f40;background-image:linear-gradient(90deg,rgba(10,43,44,.94),rgba(10,43,44,.35)),url('${EMAIL_ASSETS.scenic}');background-position:center;background-size:cover"><!--[if mso]><v:rect style="width:600px;height:280px" stroked="false"><v:fill color="#153f40"/><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:true"><![endif]--><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="kjm-hero" style="padding:34px 30px;height:160px;color:#ffffff"><h1 class="kjm-title" style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:39px;font-weight:bold;line-height:1.12;letter-spacing:-1px;margin:0 0 16px;max-width:370px;color:#ffffff">${e(heading)}</h1><p style="font-size:14px;line-height:1.6;color:#ffffff;margin:0;max-width:320px">${e(subtitle)}</p></td></tr></table><!--[if mso]></v:textbox></v:rect><![endif]--></td></tr><tr><td class="kjm-content" style="padding:26px;background:#ffffff;border-radius:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr><td width="48" valign="top" style="padding:2px 14px 0 0"><span aria-hidden="true" style="display:inline-block;width:42px;line-height:42px;text-align:center;border-radius:50%;background:${badgeBg};color:${badgeInk};font-size:27px;font-weight:bold">${symbol}</span></td><td valign="top"><h2 style="font-family:${headingFont};font-size:23px;line-height:1.3;margin:0 0 7px;color:#153f40">${e(title)}</h2>${p.customerName ? `<p style="font-size:14px;margin:0 0 6px">Hi ${e(p.customerName)},</p>` : ""}<p style="font-size:13px;line-height:1.7;color:#466261;margin:0">${e(intro)}</p></td></tr></table>${reference}${content}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td align="center" bgcolor="#153f40" style="border-radius:10px;mso-padding-alt:16px 12px"><a href="${e(action[1])}" style="display:block;padding:16px 12px;font-family:${bodyFont};font-size:14px;font-weight:bold;line-height:20px;text-align:center;text-decoration:none;color:#ffffff;border-radius:10px">${e(action[0])} &nbsp; &#8594;</a></td></tr></table><p style="font-size:11px;line-height:1.7;color:#466261;margin:14px 0 0">Questions about your ${isAdmin ? "operations update" : "rental"}? Contact <a href="mailto:${BRAND.reply}" style="color:#086d69">${BRAND.reply}</a>.</p></td></tr><tr><td align="center" style="padding:22px 20px 16px;background:#edf5f4;border-top:1px solid #d8e7e4"><p style="font-family:${headingFont};font-weight:bold;font-size:15px;letter-spacing:.2px;color:#153f40;margin:0 0 9px">KJM Motorcycle Rental</p><p style="font-size:11px;line-height:1.8;color:#466261;margin:0">Motorcycle rentals · Lapu-Lapu City, Cebu<br><a href="${BRAND.site}" style="color:#086d69;text-decoration:none">kjmride.com</a> &nbsp; · &nbsp; <a href="mailto:${BRAND.reply}" style="color:#086d69;text-decoration:none">Contact KJM</a></p><p style="font-size:9px;color:#466261;margin:12px 0 0">Cebu-inspired illustration · Decorative scenery, not your booked motorcycle</p></td></tr><tr><td height="64" background="${EMAIL_ASSETS.scenic}" bgcolor="#153f40" style="height:64px;background-color:#153f40;background-image:url('${EMAIL_ASSETS.scenic}');background-position:center 42%;background-size:cover;border-radius:0 0 16px 16px;font-size:1px;line-height:1px">&nbsp;</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  return {
    subject: `${title} — ${p.reference.replace(/[\r\n]/g, " ")}`,
    html,
    text,
  };
}
// Future online payment templates deliberately have no dispatch mapping.
export const connected: Record<string, Template> = {
  documents_received: "verification_review",
  ...Object.fromEntries(
    Object.keys(messages)
      .filter((k) => !k.startsWith("payment_") && true)
      .map((k) => [k, k as Template]),
  ),
};
