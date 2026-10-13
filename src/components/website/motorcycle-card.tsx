import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { MotorcycleVisual } from "@/components/website/motorcycle-visual";
import { formatPhp } from "@/lib/currency";
import type { MotorcycleModel } from "@/types/motorcycle";

export function MotorcycleCard({
  motorcycle,
}: {
  motorcycle: MotorcycleModel;
}) {
  return (
    <article className="group border-deep-teal/10 overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_18px_50px_rgba(18,59,66,0.07)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_65px_rgba(18,59,66,0.13)]">
      <MotorcycleVisual
        model={motorcycle.model}
        media={motorcycle.primaryImage}
        compact
      />
      <div className="p-6">
        <h3 className="text-deep-teal text-xl font-bold tracking-tight">
          {motorcycle.model}
        </h3>
        <p className="text-muted mt-3 line-clamp-2 text-sm leading-6">
          {motorcycle.description}
        </p>
        <p className="text-muted mt-2 text-sm">Starting daily rate</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <p className="text-ocean text-2xl font-extrabold">
            {formatPhp(motorcycle.dailyRatePhp)}
            <span className="text-muted text-sm font-semibold">/day</span>
          </p>
          <Link
            href={`/motorcycles/${motorcycle.slug}`}
            className="border-deep-teal/15 group-hover:bg-deep-teal inline-flex size-11 items-center justify-center rounded-full border transition-colors group-hover:text-white"
            aria-label={`View details for ${motorcycle.model}`}
          >
            <ArrowUpRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
        <div className="text-muted mt-5 flex flex-wrap gap-2 text-xs">
          {motorcycle.specifications.engineDisplacementCc && (
            <span className="bg-sand rounded-full px-3 py-2">
              {motorcycle.specifications.engineDisplacementCc} cc
            </span>
          )}
          {motorcycle.specifications.transmission && (
            <span className="bg-sand rounded-full px-3 py-2">
              {motorcycle.specifications.transmission}
            </span>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link
            href={`/motorcycles/${motorcycle.slug}`}
            className="border-deep-teal/15 flex min-h-11 items-center justify-center rounded-full border text-xs font-bold"
          >
            View details
          </Link>
          <Link
            href={`/book/${motorcycle.slug}`}
            className="bg-deep-teal flex min-h-11 items-center justify-center rounded-full text-xs font-bold text-white"
          >
            Book your ride
          </Link>
        </div>
      </div>
    </article>
  );
}
