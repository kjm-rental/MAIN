import { TriangleAlert } from "lucide-react";

import type { PublicCatalogResult } from "@/services/public-catalog";

export function CatalogSourceNotice({
  source,
  notice,
}: Pick<PublicCatalogResult, "source" | "notice">) {
  if (source === "supabase") return null;
  return (
    <p className="border-deep-teal/10 bg-off-white text-muted mb-7 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-5">
      <TriangleAlert aria-hidden="true" className="text-ocean mt-0.5 size-4 shrink-0" />
      {notice}
    </p>
  );
}
