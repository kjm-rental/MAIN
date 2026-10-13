"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { MotorcycleCard } from "@/components/website/motorcycle-card";
import type { MotorcycleModel } from "@/types/motorcycle";

type PriceRange = "all" | "under-700" | "700-999" | "1000-plus";

export function CatalogExplorer({
  motorcycles,
}: {
  motorcycles: readonly MotorcycleModel[];
}) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<PriceRange>("all");
  const [sort, setSort] = useState("price-asc");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return motorcycles
      .filter((item) => item.model.toLowerCase().includes(normalized))
      .filter((item) => {
        if (range === "under-700") return item.dailyRatePhp < 700;
        if (range === "700-999")
          return item.dailyRatePhp >= 700 && item.dailyRatePhp <= 999;
        if (range === "1000-plus") return item.dailyRatePhp >= 1000;
        return true;
      })
      .toSorted((a, b) =>
        sort === "price-desc"
          ? b.dailyRatePhp - a.dailyRatePhp
          : a.dailyRatePhp - b.dailyRatePhp,
      );
  }, [motorcycles, query, range, sort]);

  return (
    <div>
      <div className="fleet-toolbar border-deep-teal/15 grid gap-3 rounded-2xl border bg-[#F7F3EB] p-4 shadow-[0_3px_12px_rgba(21,63,64,.03)] md:grid-cols-[minmax(0,1fr)_12rem_14rem]">
        <label className="relative">
          <span className="text-muted mb-2 block pl-1 text-xs font-semibold">
            Search motorcycles
          </span>
          <Search
            aria-hidden="true"
            className="text-ocean absolute bottom-3.5 left-3 size-4"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by model name"
            aria-label="Search by motorcycle model"
            className="border-control-border bg-off-white/80 min-h-11 w-full rounded-xl border pr-4 pl-10 text-sm"
          />
        </label>
        <label>
          <span className="text-muted mb-2 flex items-center gap-2 pl-1 text-xs font-semibold">
            <SlidersHorizontal aria-hidden="true" className="size-3" />
            Daily price
          </span>
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as PriceRange)}
            aria-label="Filter by price"
            className="border-control-border bg-off-white/80 min-h-11 w-full rounded-xl border px-3 text-sm"
          >
            <option value="all">All prices</option>
            <option value="under-700">Under ₱700</option>
            <option value="700-999">₱700–₱999</option>
            <option value="1000-plus">₱1,000+</option>
          </select>
        </label>
        <label>
          <span className="text-muted mb-2 block pl-1 text-xs font-semibold">
            Sort by
          </span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort catalog"
            className="border-control-border bg-off-white/80 min-h-11 w-full rounded-xl border px-3 text-sm"
          >
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>
      <p className="text-muted mt-5 text-sm" aria-live="polite">
        {results.length} {results.length === 1 ? "motorcycle" : "motorcycles"}
      </p>
      {results.length ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((motorcycle) => (
            <MotorcycleCard key={motorcycle.slug} motorcycle={motorcycle} />
          ))}
        </div>
      ) : (
        <div className="border-deep-teal/10 mt-6 rounded-[1.5rem] border border-dashed bg-white p-12 text-center">
          <p className="text-deep-teal font-bold">
            {motorcycles.length
              ? "No motorcycles match those filters."
              : "No motorcycles are available to browse right now. Please check back soon."}
          </p>
          {motorcycles.length ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setRange("all");
              }}
              className="text-ocean mt-3 text-sm font-bold underline underline-offset-4"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
