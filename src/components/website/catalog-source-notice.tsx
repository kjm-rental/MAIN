import { Database, TriangleAlert } from "lucide-react";

import type { PublicCatalogResult } from "@/services/public-catalog";

export function CatalogSourceNotice({
  source,
  notice,
}: Pick<PublicCatalogResult, "source" | "notice">) {
  const Icon = source === "supabase" ? Database : TriangleAlert;
  return (
    <p className="border-deep-teal/10 bg-off-white text-muted mb-7 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-5">
      <Icon aria-hidden="true" className="text-ocean mt-0.5 size-4 shrink-0" />
      {notice}
    </p>
  );
}
