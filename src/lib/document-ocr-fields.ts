export type OcrFields = {
  name?: string;
  birthdate?: string;
  expiry?: string;
  categories?: string;
};
export type OcrEvidence = {
  available: boolean;
  fields: OcrFields;
  warnings: string[];
};
export function parseDocumentOcr(
  lines: { text: string; confidence: number }[],
): OcrEvidence {
  const values: Record<string, string[]> = {};
  const warnings: string[] = [];
  const patterns: [string, RegExp][] = [
    ["name", /^(?:full\s+name|name)\s*:\s*(.+)$/i],
    ["surname", /^(?:surname|last\s+name)\s*:\s*(.+)$/i],
    ["given", /^(?:given\s+names?|first\s+name)\s*:\s*(.+)$/i],
    ["birthdate", /^(?:date\s+of\s+birth|birth\s*date|dob)\s*:\s*(.+)$/i],
    [
      "expiry",
      /^(?:expiry\s*date|expiration\s*date|date\s+of\s+expiry|valid\s+until)\s*:\s*(.+)$/i,
    ],
    [
      "categories",
      /^(?:dl\s*codes?|licen[sc]e\s+categor(?:y|ies)|vehicle\s+categories)\s*:\s*(.+)$/i,
    ],
  ];
  for (const line of lines) {
    const text = line.text.trim();
    for (const [key, pattern] of patterns) {
      const match = pattern.exec(text);
      if (!match) continue;
      if (!Number.isFinite(line.confidence) || line.confidence < 85) {
        warnings.push(
          "A labeled field had low OCR confidence and was not accepted.",
        );
        continue;
      }
      (values[key] ??= []).push(match[1].trim());
    }
  }
  const unique = (key: string) => {
    const entries = [...new Set(values[key] ?? [])];
    if (entries.length > 1) {
      warnings.push(`Conflicting ${key} values require manual review.`);
      return undefined;
    }
    return entries[0];
  };
  const date = (value: string | undefined) => {
    if (!value) return undefined;
    let iso: string | undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) iso = value;
    else {
      const match =
        /^(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i.exec(
          value,
        );
      if (match) {
        const month =
          [
            "jan",
            "feb",
            "mar",
            "apr",
            "may",
            "jun",
            "jul",
            "aug",
            "sep",
            "oct",
            "nov",
            "dec",
          ].indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
        iso = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      }
    }
    if (iso) {
      const parsed = new Date(`${iso}T00:00:00Z`);
      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === iso
      )
        return iso;
    }
    warnings.push(
      "An ambiguous or invalid date was not accepted. Confirm its format manually.",
    );
    return undefined;
  };
  const name =
    unique("name") ??
    (values.name
      ? undefined
      : unique("given") && unique("surname")
        ? `${unique("given")} ${unique("surname")}`
        : undefined);
  const fields: OcrFields = {};
  if (
    name &&
    name.length <= 100 &&
    /^[\p{L} .,'’-]+$/u.test(name) &&
    name.trim().split(/\s+/).length >= 2
  )
    fields.name = name;
  fields.birthdate = date(unique("birthdate"));
  fields.expiry = date(unique("expiry"));
  const categories = unique("categories");
  if (categories && /^[A-D][12]?(?:[ ,/]+[A-D][12]?)*$/i.test(categories))
    fields.categories = categories.toUpperCase();
  else if (categories)
    warnings.push(
      "Unrecognized license-category notation requires manual review.",
    );
  for (const key of ["name", "birthdate", "expiry", "categories"] as const)
    if (!fields[key])
      warnings.push(`${key} was not reliably identified from labeled text.`);
  return { available: true, fields, warnings: [...new Set(warnings)] };
}
