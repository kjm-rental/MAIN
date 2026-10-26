import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2 } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";
import { MotorcycleCard } from "@/components/website/motorcycle-card";
import { MotorcycleVisual } from "@/components/website/motorcycle-visual";
import { CatalogSourceNotice } from "@/components/website/catalog-source-notice";
import { formatPhp } from "@/lib/currency";
import { getPublicMotorcycleCatalog } from "@/services/public-catalog";
import type { MotorcycleModel } from "@/types/motorcycle";

type Props = { params: Promise<{ slug: string }> };

export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getPublicMotorcycleCatalog();
  const motorcycle = catalog.motorcycles.find((item) => item.slug === slug);
  if (!motorcycle) return { title: "Motorcycle Not Found" };
  return {
    title: motorcycle.model,
    description: `${motorcycle.model} rental information from KJM Motorcycle Rental in Lapu-Lapu City, Cebu.`,
  };
}

export default function MotorcycleDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<DetailPageFallback />}>
      <MotorcycleDetail params={params} />
    </Suspense>
  );
}

async function MotorcycleDetail({ params }: Props) {
  const { slug } = await params;
  const catalog = await getPublicMotorcycleCatalog();
  const motorcycle = catalog.motorcycles.find((item) => item.slug === slug);
  if (!motorcycle) notFound();
  const index = catalog.motorcycles.findIndex((item) => item.slug === slug);
  const related = [
    catalog.motorcycles[(index + 1) % catalog.motorcycles.length],
    catalog.motorcycles[(index + 2) % catalog.motorcycles.length],
  ].filter((item) => item.slug !== motorcycle.slug);

  return (
    <main className="bg-off-white">
      <section className="bg-sand py-8 sm:py-12">
        <Container>
          <CatalogSourceNotice
            source={catalog.source}
            notice={catalog.notice}
          />
          <Link
            href="/motorcycles"
            className="text-ocean inline-flex items-center gap-2 text-sm font-bold"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            All motorcycles
          </Link>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-[2rem]">
              <MotorcycleVisual
                model={motorcycle.model}
                media={motorcycle.primaryImage}
              />
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-ocean text-xs font-extrabold tracking-[0.18em] uppercase">
                KJM model catalog
              </p>
              <h1 className="text-deep-teal mt-3 text-4xl font-bold tracking-[-0.045em] sm:text-6xl">
                {motorcycle.model}
              </h1>
              <dl
                aria-label="Rental rates"
                className="mt-6 grid grid-cols-3 gap-3"
              >
                {[
                  {
                    label: "Daily",
                    amount: motorcycle.dailyRatePhp,
                    unit: "day",
                  },
                  {
                    label: "Weekly",
                    amount: motorcycle.weeklyRatePhp,
                    unit: "7 days",
                  },
                  {
                    label: "Monthly",
                    amount: motorcycle.monthlyRatePhp,
                    unit: "30 days",
                  },
                ].map((rate) => (
                  <div
                    key={rate.label}
                    className="border-deep-teal/10 border-l pl-3 first:border-0 first:pl-0"
                  >
                    <dt className="text-muted text-sm">{rate.label}</dt>
                    <dd className="text-ocean mt-1 text-xl font-extrabold sm:text-2xl">
                      {rate.amount == null ? (
                        <span className="text-muted text-sm font-semibold">
                          Ask KJM
                        </span>
                      ) : (
                        formatPhp(rate.amount)
                      )}
                    </dd>
                    <p className="text-muted mt-1 text-xs">{rate.unit}</p>
                  </div>
                ))}
              </dl>
              <p className="text-muted mt-6 max-w-xl leading-7">
                {motorcycle.description}
              </p>
              <div className="border-deep-teal/10 mt-8 rounded-[1.25rem] border bg-white/60 p-5">
                <div className="flex gap-3">
                  <CalendarDays
                    aria-hidden="true"
                    className="text-ocean mt-0.5 size-5 shrink-0"
                  />
                  <div>
                    <p className="text-deep-teal font-bold">
                      Plan your island ride
                    </p>
                    <p className="text-muted mt-1 text-sm leading-6">
                      Choose your dates to check physical-unit availability.
                      Requests include document review and administrator
                      approval. Online submissions are restricted during launch
                      preparations.
                    </p>
                  </div>
                </div>
              </div>
              <ButtonLink
                href={`/book/${motorcycle.slug}`}
                className="mt-6 sm:self-start"
              >
                Request this motorcycle
              </ButtonLink>
            </div>
          </div>
          {motorcycle.galleryImages && motorcycle.galleryImages.length > 1 ? (
            <div
              className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3"
              aria-label={`${motorcycle.model} gallery`}
            >
              {motorcycle.galleryImages.slice(1).map((media) => (
                <div key={media.src} className="overflow-hidden rounded-2xl">
                  <MotorcycleVisual model={motorcycle.model} media={media} />
                </div>
              ))}
            </div>
          ) : null}
        </Container>
      </section>
      <section className="py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.55fr_1fr]">
          <div>
            <p className="text-ocean text-xs font-extrabold tracking-[0.18em] uppercase">
              Rental information
            </p>
            <h2 className="text-deep-teal mt-3 text-3xl font-bold">
              Manufacturer-reference specifications
            </h2>
          </div>
          <div className="space-y-5">
            <SpecificationPanel motorcycle={motorcycle} />
            <div className="border-deep-teal/10 rounded-[1.5rem] border bg-white p-6">
              <ul className="space-y-4">
                {[
                  "Daily, weekly (7 days), and monthly (30 days) prices use KJM’s currently active saved rates. Final pricing is confirmed for your rental dates.",
                  "This page represents a model, not a particular physical rental unit.",
                  "Availability, included equipment, policies and fees are not yet connected.",
                ].map((text) => (
                  <li
                    key={text}
                    className="text-muted flex gap-3 text-sm leading-6"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="text-ocean mt-0.5 size-5 shrink-0"
                    />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>
      <section className="bg-sand py-16 sm:py-24">
        <Container>
          <h2 className="text-deep-teal text-3xl font-bold">
            You may also want to explore
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {related.map((item) => (
              <MotorcycleCard key={item.slug} motorcycle={item} />
            ))}
          </div>
        </Container>
      </section>
      <div className="border-deep-teal/10 bg-off-white sticky bottom-0 z-30 border-t p-3 shadow-[0_-8px_30px_rgba(18,59,66,.1)] sm:hidden">
        <ButtonLink href={`/book/${motorcycle.slug}`} className="w-full">
          Request {motorcycle.model}
        </ButtonLink>
      </div>
    </main>
  );
}

function SpecificationPanel({ motorcycle }: { motorcycle: MotorcycleModel }) {
  const specs = motorcycle.specifications;
  const rows = [
    ["Manufacturer", specs.manufacturer],
    ["Exact model", specs.exactModelName],
    ["Reference year", specs.modelYear],
    [
      "Displacement",
      specs.engineDisplacementCc ? `${specs.engineDisplacementCc} cc` : null,
    ],
    ["Transmission", specs.transmission],
    [
      "Fuel tank",
      specs.fuelTankCapacityLiters ? `${specs.fuelTankCapacityLiters} L` : null,
    ],
    ["Cooling", specs.coolingSystem],
    ["Starting", specs.startingSystem],
    ["Brakes", specs.brakingSystem],
    ["Category", specs.category],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="border-deep-teal/10 overflow-hidden rounded-[1.5rem] border bg-white">
      {rows.length ? (
        <dl className="grid sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="border-deep-teal/8 border-b p-5 last:border-b-0 sm:odd:border-r"
            >
              <dt className="text-muted text-[11px] font-extrabold tracking-[0.12em] uppercase">
                {label}
              </dt>
              <dd className="text-deep-teal mt-1 text-sm leading-6 font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted p-6 text-sm">
          Technical fields are intentionally unpublished until the exact model
          and year are confirmed.
        </p>
      )}
      {specs.notableFeatures.length ? (
        <div className="p-5">
          <h3 className="text-deep-teal text-sm font-bold">
            Verified features
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {specs.notableFeatures.map((feature) => (
              <li
                key={feature}
                className="bg-sand text-deep-teal rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                {feature}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DetailPageFallback() {
  return (
    <main className="bg-sand min-h-[70svh] animate-pulse py-12">
      <Container>
        <div className="bg-deep-teal/10 h-5 w-36 rounded-full" />
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div className="bg-ocean/10 aspect-[16/11] rounded-[2rem]" />
          <div className="flex flex-col justify-center gap-5">
            <div className="bg-deep-teal/10 h-5 w-28 rounded-full" />
            <div className="bg-deep-teal/10 h-14 w-3/4 rounded-2xl" />
            <div className="bg-deep-teal/10 h-10 w-40 rounded-xl" />
          </div>
        </div>
      </Container>
    </main>
  );
}
