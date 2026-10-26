import {
  documentNamesMatch,
  normalizedNameTokens,
} from "./document-name-match";
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
  preliminaryStatus:
    "passed" | "correction_required" | "manual_review_required";
  corrections: { documentKind: string; message: string }[];
  checks: {
    label: string;
    status: "passed" | "manual" | "failed";
    detail: string;
  }[];
  riskLevel: 1 | 2 | 3;
  riskStatus:
    "DOCUMENT_CHECKS_PASSED" | "MANUAL_REVIEW_REQUIRED" | "CORRECTION_REQUIRED";
  reviewReasons: string[];
  identityReviewRequired: true;
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
  const corrections: ScreeningResult["corrections"] = [];
  const correct = (documentKind: string, message: string) =>
    corrections.push({ documentKind, message });
  const ocr: ScreeningResult["ocr"] = [];
  const started = Date.now();
  let ocrJobs = 0;
  const current = input.documents.filter((document) => !document.replaced_at);
  const required = [
    "drivers_license_front",
    input.customerType === "international_visitor"
      ? "passport"
      : "government_id",
  ];
  for (const kind of required) {
    if (!current.some((d) => d.document_kind === kind))
      correct(
        kind,
        "Please upload this required document with all text and edges visible.",
      );
    checks.push({
      label: kind.replaceAll("_", " "),
      status: current.some((document) => document.document_kind === kind)
        ? "passed"
        : "failed",
      detail: current.some((document) => document.document_kind === kind)
        ? "Required upload is present; authenticity still needs review."
        : "Required upload is missing.",
    });
  }
  // A back image is required only when requested or needed to read license details; do not invent a universal policy.
  if (!current.some((d) => d.document_kind === "drivers_license_back"))
    checks.push({
      label: "License back",
      status: "manual",
      detail:
        "If license categories or restrictions appear on the back, upload that side for review.",
    });
  // Serial, bounded processing avoids document-sized CPU/memory bursts.
  for (const document of current.slice(0, 12)) {
    const label = `${document.document_kind.replaceAll("_", " ")} · file quality`;
    if (
      ![
        "drivers_license_front",
        "drivers_license_back",
        "government_id",
        "passport",
        "international_driving_permit",
        "supporting_document",
      ].includes(document.document_kind)
    ) {
      checks.push({
        label,
        status: "manual",
        detail:
          "Unsupported document type; KJM must review the required document type.",
      });
      continue;
    }
    if (document.size_bytes <= 0 || document.size_bytes > 8388608) {
      correct(
        document.document_kind,
        "Please upload an image or PDF between 1 byte and 8 MB.",
      );
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
    let bytesLoaded = false;
    let qualityDecoded = false;
    try {
      const bytes = await input.load(document);
      bytesLoaded = true;
      if (!bytes.length || bytes.length > 8388608) {
        correct(
          document.document_kind,
          "The stored file is empty or too large. Please upload an image or PDF no larger than 8 MB.",
        );
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
        correct(
          document.document_kind,
          "The image format does not match the uploaded file type. Please export a fresh JPEG or PNG and upload it again.",
        );
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
      qualityDecoded = true;
      const channel = channels[0];
      const small =
        Math.min(metadata.width ?? 0, metadata.height ?? 0) < 480 ||
        Math.max(metadata.width ?? 0, metadata.height ?? 0) < 800;
      const poorContrast =
        !channel ||
        channel.stdev < 6 ||
        channel.mean < 15 ||
        channel.mean > 245;
      if (small || poorContrast)
        correct(
          document.document_kind,
          "Please provide a clearer, well-lit photo with all text and edges visible. Avoid glare and blur.",
        );
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
          const requiredFields =
            document.document_kind === "drivers_license_back"
              ? ([] as const)
              : ["drivers_license_front", "passport"].includes(
                    document.document_kind,
                  )
                ? (["name", "expiry", "birthdate"] as const)
                : (["name", "birthdate"] as const);
          const incomplete =
            !evidence.available || requiredFields.some((key) => !fields[key]);
          const uncertain = evidence.warnings.some((warning) =>
            /low.*confidence|conflict|ambiguous|unrecognized/i.test(warning),
          );
          if (evidence.available && incomplete && !uncertain)
            correct(
              document.document_kind,
              "Important document information could not be extracted. Please upload a clearer full image with every required field visible. KJM can review unsupported document layouts if another photo does not help.",
            );
          checks.push({
            label: `${document.document_kind.replaceAll("_", " ")} · OCR completeness`,
            status: incomplete || uncertain ? "manual" : "passed",
            detail: incomplete
              ? "Not all required text could be read reliably; review the original or provide a clearer image. Do not reupload merely because a supported document layout is unfamiliar to OCR."
              : "Required labeled fields were extracted; this does not authenticate the document.",
          });
          if (fields.name)
            checks.push({
              label: `${document.document_kind.replaceAll("_", " ")} · OCR name`,
              status: documentNamesMatch(fields.name, input.customerName)
                ? "passed"
                : "manual",
              detail: documentNamesMatch(fields.name, input.customerName)
                ? "Full normalized name tokens match the booked name, allowing punctuation and ordering differences; identity authenticity is not established."
                : "The high-confidence OCR name differs significantly from the booked name or contains uncertain initials; authorized review is required.",
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
            if (fields.expiry < currentDay || fields.expiry < pickup)
              correct(
                document.document_kind,
                "The expiry date read from this image is before today or pickup. Check the date and provide a valid replacement if expired; ask KJM to review if the date was read incorrectly.",
              );
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
            else {
              checks.push({
                label: "OCR birthdate plausibility",
                status: "manual",
                detail:
                  "The birthdate could not establish a plausible age; manual review required.",
              });
              entry.warnings.push(
                "OCR birthdate is implausible for this pickup date; confirm manually.",
              );
            }
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
      if (bytesLoaded && !qualityDecoded)
        correct(
          document.document_kind,
          "This image could not be decoded or read. Please export a clear JPEG or PNG and upload it again.",
        );
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
  const front = ocr.find(
    (entry) => entry.documentKind === "drivers_license_front",
  );
  if (
    front?.available &&
    !front.fields.documentNumberHash &&
    !front.warnings.some((warning) =>
      /low.*confidence|conflict|ambiguous/i.test(warning),
    )
  )
    correct(
      "drivers_license_front",
      "The license number could not be extracted. Upload a clear image showing the complete license number, or ask KJM to review the original.",
    );
  if (front && !front.fields.documentNumberHash)
    checks.push({
      label: "License number extraction",
      status: "manual",
      detail:
        "License number was not reliably extracted; compare the original manually.",
    });
  if (
    front?.available &&
    !front.warnings.some((warning) =>
      /low.*confidence|conflict|ambiguous/i.test(warning),
    ) &&
    !ocr.some(
      (entry) =>
        entry.documentKind.startsWith("drivers_license") &&
        entry.fields.categories,
    ) &&
    !current.some(
      (document) => document.document_kind === "drivers_license_back",
    )
  )
    correct(
      "drivers_license_back",
      "Motorcycle categories could not be read on the front. If they appear on the back, upload that side; otherwise KJM must review the original license.",
    );
  for (const field of ["name", "birthdate"] as const) {
    const values = ocr
      .map((entry) => entry.fields[field])
      .filter((value): value is string => !!value)
      .map((value) =>
        field === "name" ? normalizedNameTokens(value).join(" ") : value,
      );
    if (values.length >= 2 && new Set(values).size === 1)
      checks.push({
        label: `Cross-document ${field}`,
        status: "passed",
        detail:
          field === "name"
            ? "Full normalized name tokens match across the extracted documents; identity authenticity is not established."
            : "Extracted birthdates match across the documents; identity ownership is not established.",
      });
    if (new Set(values).size > 1) {
      checks.push({
        label: `Cross-document ${field}`,
        status: "manual",
        detail:
          "Document details differ. Check that you uploaded your own correct documents; KJM must review any discrepancy.",
      });
    }
  }
  const licenseNumbers = ocr
    .filter((entry) => entry.documentKind.startsWith("drivers_license"))
    .map((entry) => entry.fields.documentNumberHash)
    .filter(Boolean);
  if (licenseNumbers.length >= 2 && new Set(licenseNumbers).size === 1)
    checks.push({
      label: "License number consistency",
      status: "passed",
      detail:
        "Extracted front and back license-number tokens match; the original license still needs authorized review.",
    });
  if (new Set(licenseNumbers).size > 1) {
    checks.push({
      label: "License number consistency",
      status: "manual",
      detail:
        "Front and back license numbers differ; upload matching sides of the same license or request review.",
    });
  }
  checks.push({
    label: "Declared names",
    status:
      input.identityName &&
      input.licenseName &&
      documentNamesMatch(input.customerName, input.identityName) &&
      documentNamesMatch(input.customerName, input.licenseName)
        ? "passed"
        : "manual",
    detail:
      "Declared names are compared using full normalized tokens only; missing tokens, spelling differences and initials require review. Declarations do not authenticate identity.",
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
  if (
    validExpiry &&
    (input.licenseExpiry! < today || input.licenseExpiry! < pickupDay)
  )
    correct(
      "drivers_license_front",
      "Your declared license expiry is before today or pickup. Provide a valid license, or ask KJM to correct the declared date if it was entered incorrectly.",
    );
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
  const preliminaryStatus: ScreeningResult["preliminaryStatus"] =
    corrections.length
      ? "correction_required"
      : required.every((kind) =>
            ocr.some((entry) => entry.documentKind === kind && entry.available),
          ) &&
          !checks.some(
            (check) =>
              check.status !== "passed" &&
              ![
                "License back",
                "OCR, birthdate & minimum age",
                "Motorcycle license category",
              ].includes(check.label),
          )
        ? "passed"
        : "manual_review_required";
  const riskLevel =
    preliminaryStatus === "passed"
      ? 1
      : preliminaryStatus === "correction_required"
        ? 3
        : 2;
  const riskStatus =
    riskLevel === 1
      ? "DOCUMENT_CHECKS_PASSED"
      : riskLevel === 3
        ? "CORRECTION_REQUIRED"
        : "MANUAL_REVIEW_REQUIRED";
  const reviewReasons = [
    ...new Set([
      ...checks
        .filter(
          (check) =>
            check.status !== "passed" && check.label !== "License back",
        )
        .map((check) => `${check.label}: ${check.detail}`),
      "Document authenticity: authorized review is required; OCR does not establish authenticity.",
      "Identity ownership: authorized review must establish that the documents belong to this customer.",
      "Motorcycle license eligibility: authorized review must establish the applicable riding entitlement.",
    ]),
  ];
  return {
    status: checks.some((check) => check.status === "failed")
      ? "failed"
      : "manual",
    preliminaryStatus,
    riskLevel,
    riskStatus,
    reviewReasons,
    identityReviewRequired: true,
    corrections: corrections.filter(
      (item, i) =>
        corrections.findIndex(
          (other) =>
            other.documentKind === item.documentKind &&
            other.message === item.message,
        ) === i,
    ),
    checks,
    checkedAt: now.toISOString(),
    ocr,
  };
}
