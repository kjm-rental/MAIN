import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bike,
  Compass,
  Map,
  MousePointerClick,
  Sparkles,
  Waves,
} from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { FaqList } from "@/components/website/faq-list";
import { MotorcycleCard } from "@/components/website/motorcycle-card";
import { CatalogSourceNotice } from "@/components/website/catalog-source-notice";
import type { PublicCatalogResult } from "@/services/public-catalog";
import { HomeReveal } from "@/components/website/home-reveal";
import { editorialImages } from "@/lib/content/editorial-images";
import { EditorialPhotoCredit } from "@/components/website/editorial-photo-credit";

const benefits = [
  {
    icon: MousePointerClick,
    title: "Easy to explore",
    text: "Browse the confirmed model catalog and compare daily prices in one clear experience.",
  },
  {
    icon: Map,
    title: "Made for Cebu days",
    text: "Start in Lapu-Lapu City and plan a ride shaped around the places you want to discover.",
  },
  {
    icon: Sparkles,
    title: "Simple by design",
    text: "Compare rental prices, choose optional extras, and review your request before submitting.",
  },
] as const;

const steps = [
  [
    "01",
    "Choose a motorcycle",
    "Browse models and find a daily rate that fits your plans.",
  ],
  [
    "02",
    "Select rental dates",
    "Choose your pickup and return times, check availability, and add optional extras.",
  ],
  [
    "03",
    "Complete booking",
    "Enter your details and upload your ID and driver's license for private review.",
  ],
  [
    "04",
    "Get ready to ride",
    "Wait for KJM to review and approve your request before planning your pickup.",
  ],
] as const;

export function HomeSections({ catalog }: { catalog: PublicCatalogResult }) {
  return (
    <>
      <section className="bg-off-white py-20 sm:py-28">
        <Container>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading
              eyebrow="Find your ride"
              title="Featured motorcycles"
              description="Find your island companion. Explore the published KJM fleet and current daily rental rates."
            />
            <Link
              href="/motorcycles"
              className="text-ocean inline-flex items-center gap-2 text-sm font-extrabold"
            >
              View all motorcycles{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="mt-8">
            <CatalogSourceNotice
              source={catalog.source}
              notice={catalog.notice}
            />
          </div>
          {catalog.motorcycles.length ? (
            <div className="grid gap-6 md:grid-cols-3">
              {catalog.motorcycles.slice(0, 3).map((item, index) => (
                <HomeReveal key={item.slug} delay={index * 60}>
                  <MotorcycleCard motorcycle={item} />
                </HomeReveal>
              ))}
            </div>
          ) : (
            <p className="border-deep-teal/10 text-muted mt-6 rounded-3xl border border-dashed p-10 text-center text-sm">
              No motorcycles are available to browse right now. Please check
              back soon.
            </p>
          )}
        </Container>
      </section>

      <section className="bg-[#e8f0ec] py-12 sm:py-16">
        <Container className="grid items-center gap-9 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <HomeReveal>
            <figure className="relative">
              <div className="bg-deep-teal relative aspect-[4/5] max-h-[540px] overflow-hidden rounded-[2rem] rounded-tr-[6rem]">
                <Image
                  src={editorialImages.lifestyle.src}
                  alt={editorialImages.lifestyle.alt}
                  fill
                  quality={90}
                  sizes="(max-width: 1023px) calc(100vw - 40px), 560px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#092527]/95 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9">
                  <Waves
                    size={36}
                    strokeWidth={1.2}
                    className="text-sunset"
                    aria-hidden
                  />
                  <p className="mt-4 text-xs font-semibold tracking-[.18em]">
                    LAPU-LAPU / MACTAN / CEBU
                  </p>
                  <p className="font-heading mt-3 max-w-sm text-3xl leading-tight font-medium sm:text-4xl">
                    Your own pace.
                    <br />
                    Your kind of island day.
                  </p>
                </div>
              </div>
              <figcaption>
                <EditorialPhotoCredit image="lifestyle" />
              </figcaption>
            </figure>
          </HomeReveal>
          <HomeReveal delay={70}>
            <p className="text-ocean text-xs font-bold tracking-[.2em]">
              WHY KJM
            </p>
            <h2 className="font-heading mt-4 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              Less guesswork.
              <br />
              More room to explore.
            </h2>
            <p className="text-muted mt-5 max-w-lg leading-7">
              Clear prices, thoughtful choices, and a rental request reviewed by
              a real person.
            </p>
            <div className="mt-7">
              {benefits.map(({ icon: Icon, title, text }, index) => (
                <article
                  key={title}
                  className="border-deep-teal/20 flex gap-4 border-t py-5"
                >
                  <Icon
                    size={23}
                    strokeWidth={1.5}
                    className="text-ocean mt-1 shrink-0"
                    aria-hidden
                  />
                  <div>
                    <p className="text-ocean text-[11px] font-bold tracking-[.14em]">
                      0{index + 1}
                    </p>
                    <h3 className="font-heading mt-1 text-xl font-semibold">
                      {title}
                    </h3>
                    <p className="text-muted mt-2 max-w-md text-sm leading-6">
                      {text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <Link
              href="/how-it-works"
              className="text-ocean mt-3 inline-flex items-center gap-2 rounded-lg py-2 font-semibold underline-offset-4 hover:underline"
            >
              Meet the rental journey <ArrowRight size={18} aria-hidden />
            </Link>
          </HomeReveal>
        </Container>
      </section>

      <section id="how-it-works" className="bg-sand py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="Four simple steps"
            title="How it works"
            description="From finding your ride to receiving approval. Online requests remain restricted during launch preparations."
            align="center"
          />
          <HomeReveal>
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([number, title, text]) => (
                <li
                  key={number}
                  className="border-deep-teal/10 bg-off-white rounded-[1.5rem] border p-6"
                >
                  <span className="text-ocean text-xs font-extrabold tracking-[0.18em]">
                    {number}
                  </span>
                  <h3 className="text-deep-teal mt-5 text-xl font-bold">
                    {title}
                  </h3>
                  <p className="text-muted mt-3 text-sm leading-6">{text}</p>
                </li>
              ))}
            </ol>
          </HomeReveal>
        </Container>
      </section>

      <section className="bg-off-white py-20 sm:py-28">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <HomeReveal>
            <figure>
              <div className="relative aspect-[3/2] overflow-hidden rounded-[2rem] bg-[#e8f0ec]">
                <Image
                  src={editorialImages.adventure.src}
                  alt={editorialImages.adventure.alt}
                  fill
                  quality={90}
                  sizes="(max-width:1023px) calc(100vw - 40px), 560px"
                  className="object-cover"
                />
              </div>
              <figcaption>
                <EditorialPhotoCredit image="adventure" />
              </figcaption>
            </figure>
            <p className="text-muted mt-3 text-xs leading-6">
              Road-connection inspiration, not a riding recommendation. Check
              current route restrictions and conditions; this illustrative
              illustration does not confirm access.
            </p>
          </HomeReveal>
          <HomeReveal>
            <SectionHeading
              eyebrow="Explore Mactan & Cebu"
              title="Make the journey part of the destination"
              description="Discover ideas for shaping a day around Mactan and beyond. Our guides remain inspiration—not claims about exact routes, access, or travel times."
            />
            <ButtonLink href="/explore-cebu" className="mt-8">
              Explore Cebu{" "}
              <Compass aria-hidden="true" className="ml-2 size-4" />
            </ButtonLink>
          </HomeReveal>
        </Container>
      </section>

      <section className="bg-[#f5f2ea] py-12 sm:py-16">
        <Container>
          <HomeReveal className="grid gap-8 lg:grid-cols-[0.7fr_1fr] lg:gap-16">
            <div>
              <p className="text-ocean text-xs font-bold tracking-[.2em]">
                GOOD TO KNOW
              </p>
              <h2 className="font-heading mt-4 max-w-sm text-3xl leading-tight font-semibold sm:text-4xl">
                A little clarity
                <br />
                before the adventure.
              </h2>
              <p className="text-muted mt-4 max-w-sm text-sm leading-7">
                Business policies remain drafts until approved. Here are the
                answers we can share today.
              </p>
              <ButtonLink href="/faq" variant="secondary" className="mt-7">
                View all FAQs
              </ButtonLink>
            </div>
            <FaqList limit={3} preview />
          </HomeReveal>
        </Container>
      </section>

      <section className="bg-ocean py-16 text-white sm:py-20">
        <Container className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div>
            <p className="text-sunset text-xs font-extrabold tracking-[0.18em] uppercase">
              Ready to explore?
            </p>
            <h2 className="mt-3 text-3xl font-bold sm:text-5xl">
              Your Cebu Adventure Starts Here.
            </h2>
          </div>
          <ButtonLink href="/motorcycles" variant="light" className="shrink-0">
            Find Your Ride <Bike aria-hidden="true" className="ml-2 size-4" />
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}
