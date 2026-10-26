import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Bike,
  CalendarDays,
  FileCheck,
  Send,
  BadgeCheck,
  KeyRound,
  Flag,
  ArrowUpRight,
  ShieldCheck,
  Globe,
  Clock3,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button-link";
import { rentalJourney } from "@/lib/content/rental-journey";
import styles from "./journey.module.css";
import { editorialImages } from "@/lib/content/editorial-images";
import { IslandJourneyIllustration } from "@/components/website/island-journey-illustration";

export const metadata: Metadata = {
  title: "How It Works — Your Island Ride, Made Simple",
  description:
    "Follow the KJM rental journey: choose a motorcycle, request dates, complete verification, await approval, collect and return.",
};
const icons = [Bike, CalendarDays, FileCheck, Send, BadgeCheck, KeyRound, Flag];
export default function HowItWorksPage() {
  return (
    <main className="bg-off-white text-deep-teal">
      <section className="overflow-hidden bg-[#e9f1ed]">
        <Container className="grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <p className="text-ocean text-xs font-bold tracking-[0.22em]">
              LESS COMPLICATION. MORE ISLAND.
            </p>
            <h1 className="font-heading mt-5 max-w-xl text-4xl leading-[1.06] font-semibold tracking-tight sm:text-6xl">
              Your Island Ride,
              <br />
              <span className="text-ocean">Made Simple</span>
            </h1>
            <p className="text-muted mt-5 max-w-lg leading-7">
              From choosing your motorcycle to exploring Mactan and Cebu,
              here&apos;s how your KJM rental journey works.
            </p>
            <div className="mt-7">
              <ButtonLink href="/motorcycles">
                Explore Motorcycles <ArrowUpRight size={18} aria-hidden />
              </ButtonLink>
            </div>
            <p className="text-muted mt-5 flex max-w-md items-start gap-2 text-sm leading-6">
              <Clock3 size={18} className="mt-0.5 shrink-0" aria-hidden />
              Online public booking is currently restricted during launch
              preparation.
            </p>
          </div>
          <figure className="relative">
            <div className="border-deep-teal/15 relative aspect-[4/3] overflow-hidden rounded-[2rem] rounded-tr-[5rem] border">
              <Image
                src={editorialImages.journey.src}
                alt={editorialImages.journey.alt}
                fill
                preload
                sizes="(max-width: 1023px) calc(100vw - 40px), 550px"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#092527] via-[#092527]/80 to-transparent px-6 pt-20 pb-6 text-white">
                <p className="text-xs font-semibold tracking-[0.16em]">
                  CORDOVA / CEBU
                </p>
                <p className="font-heading mt-2 text-2xl font-medium">
                  A little preparation.
                  <br />A whole new perspective.
                </p>
              </div>
            </div>
            <figcaption className="text-muted mt-3 text-xs leading-5">
              Coastal illustration · Inspired by Cordova, not a documentary photograph.
            </figcaption>
          </figure>
        </Container>
      </section>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="border-deep-teal/15 mb-10 flex flex-col justify-between gap-4 border-b pb-7 md:flex-row md:items-end">
            <div>
              <p className="text-ocean text-xs font-bold tracking-[0.2em]">
                THE RENTAL JOURNEY
              </p>
              <h2 className="font-heading mt-3 text-3xl font-semibold sm:text-4xl">
                Seven moments. One island ride.
              </h2>
            </div>
            <p className="text-muted max-w-sm text-sm leading-6">
              From your first browse to your final return, know what comes next.
            </p>
          </div>
          <div className="grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <aside className="bg-deep-teal overflow-hidden rounded-[2rem] text-white lg:sticky lg:top-32">
              <IslandJourneyIllustration />
              <div className="p-6 sm:p-8">
                <p className="text-sunset text-xs font-bold tracking-[0.18em]">
                  TAKE THE ISLAND AT YOUR OWN PACE
                </p>
                <h3 className="font-heading mt-4 text-3xl font-medium">
                  The view is worth
                  <br />
                  planning for.
                </h3>
                <p className="mt-4 leading-7 text-[#e0ece8]">
                  Find inspiration in Mactan’s history, Cordova’s coastal
                  evenings and Cebu’s highlands. Plan around your experience and
                  the conditions on the day.
                </p>
                <Link
                  href="/explore-cebu"
                  className="text-sunset mt-6 inline-flex items-center gap-2 rounded-lg py-2 font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Explore the destination guide{" "}
                  <ArrowUpRight size={18} aria-hidden />
                </Link>
              </div>
            </aside>
            <ol className={styles.timeline}>
              {rentalJourney.map((step, index) => {
                const Icon = icons[index];
                return (
                  <li
                    key={step.title}
                    className={`${styles.step} flex gap-5 pb-8 sm:gap-6 sm:pb-10`}
                  >
                    <span
                      className={`${styles.marker} border-deep-teal/25 text-deep-teal relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border bg-[#e9f1ed] sm:size-14`}
                    >
                      <Icon size={22} strokeWidth={1.6} aria-hidden />
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-ocean text-xs font-bold tracking-[0.12em]">
                        0{index + 1} / {step.label.toUpperCase()}
                      </p>
                      <h3 className="font-heading mt-2 text-2xl leading-tight font-semibold sm:text-3xl">
                        {step.title}
                      </h3>
                      <p className="text-muted mt-3 max-w-xl leading-7">
                        {step.text}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Container>
      </section>
      <section className="bg-[#e9f1ed] py-10 sm:py-14">
        <Container>
          <p className="text-ocean text-xs font-bold tracking-[0.2em]">
            BEFORE YOU REQUEST
          </p>
          <h2 className="font-heading mt-3 text-3xl font-semibold">
            A few things to know.
          </h2>
          <p className="text-muted mt-4 leading-7">
            Read the{" "}
            <Link href="/terms" className="text-ocean font-bold underline">
              complete Terms and Conditions
            </Link>{" "}
            before requesting a ride. Student permits are prohibited. Travel
            outside Cebu Province and ferry or RoRo transport require prior
            written approval.
          </p>
          <div className="mt-8 grid gap-7 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Verification before pickup",
                text: "Eligible reservations confirm after required uploads and backend checks. Identification and driving documents still require staff approval before pickup; international bookings retain manual booking approval.",
              },
              {
                icon: FileCheck,
                title: "Bring the right documents",
                text: "A government ID or passport and driver’s license are required. Documents are reviewed manually; uploading them does not mean approval.",
              },
              {
                icon: Globe,
                title: "Visiting from overseas?",
                text: "Foreign renters must provide any applicable IDP, translation or other required licensing documentation. KJM manually reviews eligibility before approval.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="border-deep-teal/25 border-t pt-5">
                <Icon
                  size={25}
                  strokeWidth={1.5}
                  className="text-ocean"
                  aria-hidden
                />
                <h3 className="font-heading mt-4 text-xl font-semibold">
                  {title}
                </h3>
                <p className="text-muted mt-3 text-sm leading-7">{text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
      <section className="py-10 sm:py-14">
        <Container>
          <div className="bg-deep-teal flex flex-col items-start justify-between gap-7 rounded-[2rem] p-7 text-white sm:p-10 md:flex-row md:items-center">
            <div>
              <p className="text-sunset text-xs font-bold tracking-[0.18em]">
                YOUR NEXT CHAPTER
              </p>
              <h2 className="font-heading mt-3 text-3xl font-semibold sm:text-4xl">
                Start with a ride that feels like you.
              </h2>
              <p className="mt-3 max-w-lg leading-7 text-[#e0ece8]">
                Browse the collection while we prepare for launch. Public
                booking remains restricted.
              </p>
            </div>
            <ButtonLink href="/motorcycles">
              Explore Motorcycles <ArrowUpRight size={18} aria-hidden />
            </ButtonLink>
          </div>
        </Container>
      </section>
    </main>
  );
}
