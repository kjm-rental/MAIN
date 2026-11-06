import type { ReactNode } from "react";
import { ArrowRight, Compass } from "lucide-react";
import Link from "next/link";
import type { MotorcycleModel } from "@/types/motorcycle";

export function BookingPreview({
  motorcycles,
  bikeCount,
}: {
  motorcycles: readonly MotorcycleModel[];
  bikeCount?: ReactNode;
}) {
  return (
    <section
      id="plan-your-ride"
      aria-label="Explore our bikes"
      className="border-deep-teal/10 bg-off-white text-deep-teal relative scroll-mt-24 overflow-hidden rounded-[1.75rem] border p-6 shadow-[0_24px_70px_rgba(18,59,66,0.18)] sm:p-8"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="bg-sand text-ocean inline-flex size-12 items-center justify-center rounded-2xl">
          <Compass aria-hidden="true" className="size-6" />
        </span>
        <span className="text-muted text-[10px] font-bold tracking-[0.16em] uppercase">
          {bikeCount ??
            (motorcycles.length
              ? `${motorcycles.length} bikes to explore`
              : "Find your island ride")}
        </span>
      </div>
      <h2 className="mt-6 text-3xl leading-tight font-extrabold tracking-tight sm:text-[2.25rem]">
        Explore our bikes.
        <span className="text-ocean block">Find your freedom.</span>
      </h2>
      <p className="text-muted mt-4 text-sm leading-7">
        Easy city rides or a little island adventure. Browse our motorcycles,
        compare rental rates, and find the ride that feels like you.
      </p>
      <Link
        href="/motorcycles"
        className="bg-sunset text-deep-teal hover:bg-sand mt-7 flex min-h-14 items-center justify-between gap-4 rounded-full px-6 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Explore our bikes
        <ArrowRight aria-hidden="true" className="size-5" />
      </Link>
      <p className="text-muted mt-4 text-center text-xs leading-5">
        Pick your bike first. Plan your dates next.
      </p>
    </section>
  );
}
