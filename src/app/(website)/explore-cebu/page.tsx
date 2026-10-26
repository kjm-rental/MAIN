import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUpRight,
  MapPin,
  Mountain,
  ShieldCheck,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button-link";
import { IslandJourneyIllustration } from "@/components/website/island-journey-illustration";
import {
  destinations,
  destinationGroups,
  destinationMapUrl,
  type Destination,
} from "@/lib/content/destinations";
export const metadata: Metadata = {
  title: "Explore Cebu — An Island Destination Guide",
  description:
    "Discover Mactan, Cordova, Cebu City’s heritage and scenic highlands with KJM’s destination guide.",
};
function DestinationCard({
  d,
  index,
  wide,
}: {
  d: Destination;
  index: number;
  wide: boolean;
}) {
  return (
    <article
      id={d.id}
      className={`group border-deep-teal/15 bg-off-white overflow-hidden rounded-[1.75rem] border shadow-[0_8px_30px_rgba(21,63,64,.04)] ${wide ? "md:col-span-2 md:grid md:grid-cols-2" : ""}`}
    >
      <figure
        className={`relative overflow-hidden bg-[#e8efea] ${wide ? "aspect-[4/3] md:aspect-auto md:min-h-80" : "aspect-[4/3]"}`}
      >
        {d.image ? (
          <Image
            src={d.image.src}
            alt={d.image.alt}
            fill
            sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1279px) 45vw, 570px"
            className="object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-[linear-gradient(145deg,#f1e9db,#dceae2)] px-8 text-center">
            <Mountain size={48} strokeWidth={1} aria-hidden />
            <span className="font-heading text-2xl font-semibold">
              A little color in the hills
            </span>
            <span className="text-muted text-sm">
              Sirao photograph awaiting verification
            </span>
          </div>
        )}
        <span className="bg-off-white border-deep-teal/15 absolute top-4 left-4 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wider shadow-sm">
          {d.category}
        </span>
      </figure>
      <div className="flex flex-col p-6 sm:p-7">
        <p className="text-ocean mb-3 text-xs font-bold tracking-[0.18em]">
          CEBU FIELD NOTES / {String(index + 1).padStart(2, "0")}
        </p>
        <h3 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {d.name}
        </h3>
        <p className="text-muted mt-3 flex items-start gap-2 text-sm">
          <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />
          {d.location}
        </p>
        <p className="text-muted mt-5 leading-7">{d.description}</p>
        <p className="border-sunset text-muted mt-5 border-l-2 pl-4 text-sm leading-6">
          {d.note}
        </p>
        <div className="border-deep-teal/15 mt-6 flex flex-wrap items-center gap-5 border-t pt-5">
          <a
            href={destinationMapUrl(d)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${d.name} on Google Maps (opens new tab)`}
            className="bg-deep-teal focus-visible:outline-ocean hover:bg-ocean inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            View on Map <ArrowUpRight size={18} aria-hidden />
          </a>
          <a
            href={d.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted text-sm underline underline-offset-4"
          >
            Visit source
            <span className="sr-only"> for {d.name} (opens new tab)</span>
          </a>
        </div>
      </div>
    </article>
  );
}
export default function ExploreCebuPage() {
  return (
    <main className="bg-sand text-deep-teal">
      <section className="bg-deep-teal relative isolate overflow-hidden text-white">
        <Container className="relative grid items-center gap-9 py-12 sm:py-16 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <p className="text-xs font-bold tracking-[0.24em] text-[#f6ad88]">
              THE KJM DESTINATION JOURNAL
            </p>
            <h1 className="font-heading mt-6 max-w-3xl text-5xl leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              An island.
              <br />A city.
              <br />
              <span className="text-[#f6ad88]">Your kind of Cebu.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white sm:text-lg">
              Coastal evenings, stories carved in stone, and a skyline seen from
              the hills. Find a place that makes you want to linger.
            </p>
            <a
              href="#destinations"
              className="bg-deep-teal hover:bg-ocean mt-8 inline-flex items-center gap-3 rounded-full border border-white/60 px-6 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              Discover the places <ArrowDown size={18} aria-hidden />
            </a>
          </div>
          <IslandJourneyIllustration guide />
        </Container>
      </section>
      <Container className="py-12 sm:py-16">
        <div className="border-deep-teal/20 grid gap-6 border-b pb-10 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <h2 className="font-heading text-3xl leading-tight font-semibold sm:text-4xl">
            More than a destination.
            <br />A reason to take the scenic pause.
          </h2>
          <div>
            <p className="text-muted leading-8">
              Start around Lapu-Lapu and Mactan, discover Cebu City’s heritage,
              or look toward the highlands. These six places are inspiration for
              your own plans—not a guided tour or a promise of motorcycle
              access.
            </p>
            <p className="text-muted mt-4 text-sm leading-6">
              Check current venue hours, fees, road conditions and permitted
              parking before you go. Map links identify places; they are not
              verified riding routes.
            </p>
          </div>
        </div>
        <nav
          aria-label="Destination areas"
          className="flex flex-wrap gap-3 pt-6"
        >
          {destinationGroups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="border-deep-teal/35 bg-off-white hover:bg-deep-teal focus-visible:outline-ocean rounded-full border px-5 py-3 text-sm font-semibold transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {g.title} <span aria-hidden>↗</span>
            </a>
          ))}
        </nav>
        <div id="destinations">
          {destinationGroups.map((g, i) => (
            <section
              key={g.id}
              id={g.id}
              className="scroll-mt-32 pt-12 sm:pt-16"
              aria-labelledby={`${g.id}-title`}
            >
              <div className="mb-7 flex items-start gap-5">
                <span className="font-heading text-ocean pt-1 text-xl">
                  0{i + 1}
                </span>
                <div>
                  <h2
                    id={`${g.id}-title`}
                    className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl"
                  >
                    {g.title}
                  </h2>
                  <p className="text-muted mt-2 leading-7">{g.intro}</p>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {destinations
                  .filter((d) => d.group === g.id)
                  .map((d) => (
                    <DestinationCard
                      key={d.id}
                      d={d}
                      index={destinations.indexOf(d)}
                      wide={d.id === "cross" || d.id === "tops"}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="border-deep-teal/20 mt-12 rounded-3xl border bg-[#e8efea] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-ocean shrink-0" aria-hidden />
            <h2 className="font-heading text-2xl font-semibold">
              A good journey starts with a safe ride.
            </h2>
          </div>
          <p className="text-muted mt-4 max-w-4xl leading-7">
            Wear a helmet, carry a valid licence, and ride within your
            experience. Highland roads can be steep, winding or slippery; choose
            alternative transport if conditions or your confidence call for it.
            Follow local restrictions and never enter private roads without
            permission.
          </p>
          <p className="text-muted mt-3 max-w-4xl text-sm leading-6">
            These are land-based destinations, not island-hopping excursions. No
            boat trip is included; any separate offshore visit requires its own
            transport arrangements. Motorcycle entry, parking and admission are
            not guaranteed. KJM is a motorcycle rental business, not an official
            tour operator.
          </p>
        </aside>
      </Container>
      <section className="bg-deep-teal text-white">
        <Container className="flex flex-col items-start justify-between gap-7 py-12 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#f6ad88]">
              THE NEXT CHAPTER IS YOURS
            </p>
            <h2 className="font-heading mt-3 text-3xl font-semibold sm:text-4xl">
              Find the ride for your island plans.
            </h2>
            <p className="mt-3 text-white">
              Explore the KJM motorcycle collection.
            </p>
          </div>
          <ButtonLink href="/motorcycles">
            Explore Motorcycles <ArrowUpRight size={18} aria-hidden />
          </ButtonLink>
        </Container>
      </section>
    </main>
  );
}
