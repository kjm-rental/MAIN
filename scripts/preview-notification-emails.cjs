/* eslint-disable @typescript-eslint/no-require-imports -- Local-only HTML preview generator. */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
(async () => {
  const root = path.resolve(__dirname, "..");
  const { render, EMAIL_ASSETS } = await import(
    pathToFileURL(path.join(root, "src/lib/notifications/templates.ts")).href
  );
  const directory = path.join(root, "docs/notifications/previews");
  fs.mkdirSync(directory, { recursive: true });
  const sample = {
    bookingId: "11111111-1111-4111-8111-111111111111",
    reference: "KJM-PREVIEW-001",
    customerName: "Alex Sample",
    motorcycle: "Honda Click 160",
    pickupAt: "2030-01-01T01:00:00Z",
    returnAt: "2030-01-02T01:00:00Z",
    rentalCentavos: 70000,
  };
  const entries = [
    ["booking_approved", "booking-confirmed.html", "Booking Confirmed"],
    [
      "verification_approved",
      "identity-verification-approved.html",
      "Identity Verification Approved",
    ],
    ["pickup_reminder", "pickup-reminder.html", "Pickup Reminder"],
  ];
  for (const [template, filename] of entries) {
    const result = render(template, sample);
    // Preview files use existing local assets so they open without a server/network.
    let html = result.html
      .replaceAll(
        EMAIL_ASSETS.logo,
        "../../../public/images/brand/kjm-logo.png",
      )
      .replaceAll(
        EMAIL_ASSETS.scenic,
        "../../../public/images/island/cebu-coastal-ride-v2.webp",
      );
    html = html.replace(
      /(<body[^>]*>)/,
      '$1<div role="note" style="background:#fff0b5;padding:12px 18px;color:#153f40;font:12px Arial,sans-serif;text-align:center">LOCAL PREVIEW · Fictional details. No booking or verification record exists. No email was sent. Pickup address and actual motorcycle photo are intentionally omitted.</div>',
    );
    fs.writeFileSync(path.join(directory, filename), html);
    fs.writeFileSync(
      path.join(directory, filename.replace(".html", ".txt")),
      `LOCAL FICTIONAL PREVIEW ONLY\n\n${result.text}`,
    );
  }
  fs.writeFileSync(
    path.join(directory, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KJM email design previews</title><style>body{margin:0;background:#f1e9db;color:#153f40;font:14px Arial,sans-serif}header{padding:22px}h1{font-size:23px;margin:0 0 8px}.panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 16px 20px}iframe{width:100%;height:1850px;border:0;border-radius:12px}a{color:#086d69}@media(max-width:1000px){.panels{grid-template-columns:1fr}}</style></head><body><header><h1>KJM transactional email previews</h1><p>Fictional data · Local assets · No emails sent · No customer document images</p><nav>${entries.map(([, file, title]) => `<a href="${file}">${title}</a>`).join(" &nbsp; · &nbsp; ")}</nav></header><div class="panels">${entries.map(([, file, title]) => `<iframe title="${title}" src="${file}"></iframe>`).join("")}</div></body></html>`,
  );
  console.log(
    "Generated three fictional HTML/plain-text previews and an index in docs/notifications/previews. No provider or database calls.",
  );
})().catch(() => {
  console.error("Local preview generation failed.");
  process.exitCode = 1;
});
