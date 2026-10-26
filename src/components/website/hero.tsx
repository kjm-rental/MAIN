import { ArrowRight, Compass, MapPin, Tag } from "lucide-react";
import Image from "next/image";
import "./hero.css";
import type { MotorcycleModel } from "@/types/motorcycle";

import { BookingPreview } from "@/components/website/booking-preview";
import { ButtonLink } from "@/components/ui/button-link";
import { Container } from "@/components/ui/container";
import { formatPhp } from "@/lib/currency";

export function Hero({
  motorcycles,
}: {
  motorcycles: readonly MotorcycleModel[];
}) {
  return (
    <section className="island-hero kjm-coastal-hero relative isolate overflow-hidden text-white">
      <Container className="kjm-coastal-content">
        <div className="kjm-coastal-copy">
          <p className="kjm-coastal-location text-deep-teal border-ocean/15 bg-sand inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-extrabold tracking-[0.12em] uppercase">
            <MapPin aria-hidden="true" className="size-4" />
            Lapu-Lapu City · Mactan Island
          </p>
          <h1 className="text-deep-teal mt-7 max-w-4xl text-5xl leading-[0.98] font-bold tracking-[-0.055em] sm:text-7xl lg:text-[5.4rem]">
            Discover Cebu
            <span className="block">
              on <span className="text-sunset">two wheels.</span>
            </span>
          </h1>
          <p className="kjm-coastal-description text-on-dark-muted mt-7 max-w-2xl text-lg leading-8">
            <span className="kjm-coastal-description-desktop">
              Explore Lapu-Lapu, Mactan and Cebu with the freedom of your own
              ride. Find the perfect motorcycle for your island adventure.
            </span>
            <span className="kjm-coastal-description-mobile">
              Explore Cebu your way. Find your perfect motorcycle and ride
              freely.
            </span>
          </p>
          {motorcycles.length > 0 && (
            <p className="kjm-coastal-price mt-5 font-bold">
              <Tag aria-hidden="true" className="kjm-coastal-price-icon" />
              <span>
                Island rides from{" "}
                {formatPhp(Math.min(...motorcycles.map((m) => m.dailyRatePhp)))}
                /day
              </span>
            </p>
          )}
          <div className="kjm-coastal-actions mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/motorcycles">
              Explore Motorcycles{" "}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </ButtonLink>
            <ButtonLink
              href="/book"
              variant="light"
              className="kjm-coastal-book-action"
            >
              Book your ride
            </ButtonLink>
          </div>
          <div className="kjm-coastal-note text-on-dark-muted mt-10 flex items-center gap-3 text-xs font-semibold">
            <Compass aria-hidden="true" className="text-sunset size-5" />
            <span>A simple starting point for your Cebu journey.</span>
          </div>
        </div>
        <div className="kjm-coastal-scene">
          <Image
            src="/images/island/cebu-coastal-ride-v2.webp"
            alt="Rear view of a helmeted scooter rider exploring a tropical coastal road beside turquoise ocean and palms"
            fill
            preload
            sizes="100vw"
            className="kjm-coastal-photo"
          />
          <div aria-hidden="true" className="kjm-coastal-overlay" />
        </div>
        <div className="kjm-coastal-booking">
          <BookingPreview motorcycles={motorcycles} />
        </div>
      </Container>
    </section>
  );
}
