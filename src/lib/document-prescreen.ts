import "server-only";
import sharp from "sharp";
import type { OcrEvidence } from "./document-ocr-fields";
export type ScreeningDocument = {
  id: string;
  document_kind: string;
  mime_type: string;
  size_bytes: number;
  replaced_at?: string | null;
};
export type ScreeningResult = {
  status: "passed" | "manual" | "failed";
  checks: {
    label: string;
    status: "passed" | "manual" | "failed";
    detail: string;
  }[];
  checkedAt: string;
  ocr: (OcrEvidence & { documentKind: string; ageAtPickup?: number })[];
};
/** Advisory file checks only. Never modifies verification decisions or pickup eligibility. */
export async function screenDocuments(
  input: {
    documents: ScreeningDocument[];
    customerType: string;
    customerName: string;
    identityName: string | null;
    licenseName: string | null;
    licenseExpiry: string | null;
    categories: string | null;
    pickupAt: string;
    load: (document: ScreeningDocument) => Promise<Uint8Array>;
    ocr?: (image: Buffer, timeoutMs: number) => Promise<OcrEvidence>;
  },
  now = new Date(),
): Promise<ScreeningResult> {
  const checks: ScreeningResult["checks"] = [];
  const ocr: ScreeningResult["ocr"] = [];
  const started = Date.now();
  let ocrJobs = 0;
  const normalizeOcrName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const current = input.documents.filter((document) => !document.replaced_at);
  const required = [
    "drivers_license_front",
    input.customerType === "international_visitor"
      ? "passport"
      : "government_id",
  ];
  for (const kind of required)
    checks.push({
      label: kind.replaceAll("_", " "),
      status: current.some((document) => document.document_kind === kind)
        ? "passed"
        : "failed",
      detail: current.some((document) => document.document_kind === kind)
        ? "Required upload is present; authenticity still needs review."
        : "Required upload is missing.",
    });
  // Serial, bounded processing avoids document-sized CPU/memory bursts.
  for (const document of current.slice(0, 12)) {
    const label = `${document.document_kind.replaceAll("_", " ")} · file quality`;
    if (document.size_bytes <= 0 || document.size_bytes > 8388608) {
      checks.push({
        label,
        status: "failed",
        detail: "Empty or oversized file.",
      });
      continue;
    }
    if (document.mime_type === "application/pdf") {
      checks.push({
        label,
        status: "manual",
        detail:
          "PDF OCR is not supported in this stage; review PDF pages manually.",
      });
      continue;
    }
    try {
      const bytes = await input.load(document);
      if (!bytes.length || bytes.length > 8388608) {
        checks.push({
          label,
          status: "failed",
          detail: "Empty or oversized stored file.",
        });
        continue;
      }
      const image = sharp(Buffer.from(bytes), {
        limitInputPixels: 16000000,
        failOn: "error",
      });
      const metadata = await image.metadata();
      const formats: Record<string, string[]> = {
        "image/jpeg": ["jpeg"],
        "image/png": ["png"],
        "image/webp": ["webp"],
        "image/avif": ["heif", "avif"],
      };
      if (
        !metadata.format ||
        !formats[document.mime_type]?.includes(metadata.format)
      ) {
        checks.push({
          label,
          status: "failed",
          detail:
            "Stored file format does not match its registered image type.",
        });
        continue;
      }
      if ((metadata.pages ?? 1) > 1) {
        checks.push({
          label,
          status: "manual",
          detail: "Multi-frame image requires manual review.",
        });
        continue;
      }
      const { channels } = await image
        .rotate()
        .resize(256, 256, { fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .greyscale()
        .stats();
      const channel = channels[0];
      const small =
        Math.min(metadata.width ?? 0, metadata.height ?? 0) < 480 ||
        Math.max(metadata.width ?? 0, metadata.height ?? 0) < 800;
      const poorContrast =
        !channel ||
        channel.stdev < 6 ||
        channel.mean < 15 ||
        channel.mean > 245;
      checks.push({
        label,
        status: small || poorContrast ? "manual" : "passed",
        detail: small
          ? "Low resolution; inspect text readability manually."
          : poorContrast
            ? "Possible blank, dark, washed-out or low-contrast image; inspect manually."
            : "Image decoded; resolution and basic contrast checks passed. Blur, glare and text readability still need review.",
      });
      if (input.ocr) {
        if (ocrJobs >= 4 || Date.now() - started >= 20000) {
          ocr.push({
            documentKind: document.document_kind,
            available: false,
            fields: {},
            warnings: [
              "OCR request limit reached; review this document manually.",
            ],
          });
        } else {
          ocrJobs++;
          const prepared = await sharp(Buffer.from(bytes), {
            limitInputPixels: 16000000,
            failOn: "error",
          })
            .rotate()
            .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
            .flatten({ background: "white" })
            .greyscale()
            .png()
            .toBuffer();
          const evidence = await input.ocr(
            prepared,
            Math.max(100, Math.min(8000, 20000 - (Date.now() - started))),
          );
          const entry: ScreeningResult["ocr"][number] = {
            ...evidence,
            documentKind: document.document_kind,
          };
          const fields = evidence.fields;
          if (fields.name)
            checks.push({
              label: `${document.document_kind.replaceAll("_", " ")} · OCR name`,
              status:
                normalizeOcrName(fields.name) ===
                normalizeOcrName(input.customerName)
                  ? "passed"
                  : "manual",
              detail:
                "Compared a high-confidence labeled OCR candidate with the booked name. Any discrepancy requires human review; a match does not authenticate identity.",
            });
          if (fields.expiry) {
            const isLicense =
              document.document_kind.startsWith("drivers_license");
            const pickup = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Manila",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(input.pickupAt));
            const currentDay = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Manila",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(now);
            checks.push({
              label: isLicense
                ? "OCR license expiry"
                : "OCR identity document expiry",
              status:
                fields.expiry < currentDay || fields.expiry < pickup
                  ? "failed"
                  : isLicense && fields.expiry !== input.licenseExpiry
                    ? "manual"
                    : "passed",
              detail:
                "Compared the OCR candidate with today, pickup date, and declared expiry. Verify the original image; OCR can be wrong and never changes approval.",
            });
          }
          if (fields.birthdate) {
            const pickup = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Manila",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(input.pickupAt));
            const age =
              Number(pickup.slice(0, 4)) -
              Number(fields.birthdate.slice(0, 4)) -
              (pickup.slice(5) < fields.birthdate.slice(5) ? 1 : 0);
            if (age >= 0 && age <= 100) entry.ageAtPickup = age;
            else
              entry.warnings.push(
                "OCR birthdate is implausible for this pickup date; confirm manually.",
              );
            entry.warnings.push(
              "No verified booking birthdate or structured minimum-age policy exists; age eligibility needs manual review.",
            );
          }
          if (
            fields.categories &&
            document.document_kind.startsWith("drivers_license")
          )
            checks.push({
              label: "OCR license categories",
              status:
                fields.categories.replace(/[ ,/]+/g, ",") ===
                (input.categories ?? "").toUpperCase().replace(/[ ,/]+/g, ",")
                  ? "passed"
                  : "manual",
              detail:
                "Compared printed category notation with the customer declaration only. Issuing-country driving entitlement and international rules still require manual review.",
            });
          ocr.push(entry);
        }
      }
    } catch {
      // Storage/audit/runtime failures must not be interpreted as invalid identity.
      checks.push({
        label,
        status: "manual",
        detail:
          "Could not safely read or decode this image; manual review required.",
      });
    }
  }
  if (current.length > 12)
    checks.push({
      label: "Additional uploads",
      status: "manual",
      detail:
        "Only the first 12 current files were screened; inspect additional uploads manually.",
    });
  const normalize = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  checks.push({
    label: "Declared names",
    status:
      input.identityName &&
      input.licenseName &&
      normalize(input.customerName) === normalize(input.identityName) &&
      normalize(input.customerName) === normalize(input.licenseName)
        ? "passed"
        : "manual",
    detail:
      "Comparison uses customer-entered names only. Document names must be checked manually; no OCR identity match is claimed.",
  });
  const pickupDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(input.pickupAt));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const expiryDate = input.licenseExpiry
    ? new Date(`${input.licenseExpiry}T00:00:00Z`)
    : null;
  const validExpiry =
    input.licenseExpiry &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.licenseExpiry) &&
    expiryDate &&
    !Number.isNaN(expiryDate.getTime()) &&
    expiryDate.toISOString().slice(0, 10) === input.licenseExpiry;
  checks.push({
    label: "Declared license expiry",
    status: !validExpiry
      ? "manual"
      : input.licenseExpiry! < today || input.licenseExpiry! < pickupDay
        ? "failed"
        : "passed",
    detail:
      "Compared the declared expiry with today and pickup in Asia/Manila. The actual document expiry is not extracted or verified.",
  });
  checks.push({
    label: "OCR, birthdate & minimum age",
    status: "manual",
    detail:
      "No verified booking birthdate or structured minimum-age rule is stored. OCR candidates, age eligibility and legal riding entitlement still require manual review.",
  });
  checks.push({
    label: "Motorcycle license category",
    status: "manual",
    detail: input.categories
      ? "A category was declared; document category and riding entitlement are not automatically verified."
      : "No license category was declared.",
  });
  return {
    status: checks.some((check) => check.status === "failed")
      ? "failed"
      : "manual",
    checks,
    checkedAt: now.toISOString(),
    ocr,
  };
}
