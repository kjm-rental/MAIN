import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, Waves } from "lucide-react";
import { AboutReveal } from "@/components/website/about-reveal";
import "@/components/website/about-page.css";

export const metadata: Metadata = {
  title: "About KJM",
  description: "KJM Motorcycle Rental in Lapu-Lapu City, Mactan Island, Cebu.",
};

function ExploreButton({ secondary = false }: { secondary?: boolean }) {
  return (
    <Link
      className={`kjm-about-button ${secondary ? "kjm-about-button-light" : ""}`}
      href="/motorcycles"
    >
      Explore Motorcycles <ArrowUpRight size={20} aria-hidden="true" />
    </Link>
  );
}

export default function AboutPage() {
  return (
    <main className="kjm-about-page">
      <section
        className="kjm-about-hero kjm-about-container"
        aria-labelledby="about-title"
      >
        <div className="kjm-about-hero-copy">
          <p className="kjm-about-eyebrow">
            <MapPin size={15} aria-hidden="true" /> LAPU-LAPU CITY · MACTAN
            ISLAND
          </p>
          <h1 id="about-title">
            Your Island.
            <br />
            Your Adventure.
            <br />
            <em>Your Ride.</em>
          </h1>
          <p className="kjm-about-lead">
            Based in Lapu-Lapu City, KJM Motorcycle Rental helps you explore
            Mactan and Cebu with the freedom of your own ride.
          </p>
          <ExploreButton />
          <p className="kjm-about-hero-foot">
            <Waves size={24} aria-hidden="true" /> A little more island. A
            little more freedom.
          </p>
        </div>
        <figure className="kjm-about-hero-figure">
          <div className="kjm-about-hero-image">
            <Image
              src="/images/island/tropical-beach-ai.webp"
              alt="Illustrative scenery of a Philippine tropical beach, not a specific resort"
              fill
              preload
              sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1200px) 48vw, 540px"
            />
            <span className="kjm-about-photo-tag">MACTAN ISLAND / CEBU</span>
          </div>
          <figcaption className="kjm-about-credit">
            Tropical beach illustration · Not a specific resort.
          </figcaption>
        </figure>
      </section>
      <section
        className="kjm-about-intro kjm-about-container"
        aria-labelledby="intro-title"
      >
        <AboutReveal className="kjm-about-intro-grid">
          <div>
            <p className="kjm-about-eyebrow">HELLO FROM KJM</p>
            <h2 id="intro-title">
              An island pace.
              <br />
              <em>A personal journey.</em>
            </h2>
            <Waves
              className="kjm-about-small-wave"
              size={52}
              strokeWidth={1}
              aria-hidden="true"
            />
          </div>
          <div className="kjm-about-intro-text">
            <p className="kjm-about-big-copy">
              Start with a ride that suits you. Leave room for the island.
            </p>
            <p>
              KJM Motorcycle Rental is based in Lapu-Lapu City, Mactan Island,
              Cebu. Browse published motorcycles and current rental prices, then
              plan your dates and optional extras when booking access is
              available.
            </p>
            <p>
              A valid identity document and driver’s license are required.
              Documents are submitted for private review, and KJM reviews every
              request before confirming a rental. International renter
              eligibility receives manual review.
            </p>
            <div className="kjm-about-launch-note">
              <span aria-hidden="true" />
              <p>
                Online booking remains restricted while launch preparation and
                business policy approvals continue.
              </p>
            </div>
          </div>
        </AboutReveal>
      </section>
      <section className="kjm-about-island" aria-labelledby="island-title">
        <AboutReveal className="kjm-about-island-grid kjm-about-container">
          <figure>
            <div className="kjm-about-island-image">
              <Image
                src="/images/island/coastal-sunset-ai.webp"
                alt="Illustrative scenery of a Cordova-inspired coastal sunset"
                fill
                sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1200px) 50vw, 580px"
              />
            </div>
            <figcaption className="kjm-about-credit">
            Coastal sunset illustration · Inspired by Cordova.
          </figcaption>
          </figure>
          <div className="kjm-about-island-copy">
            <p className="kjm-about-eyebrow">BEYOND THE EVERYDAY</p>
            <h2 id="island-title">
              Discover More of
              <br />
              <em>Mactan and Cebu</em>
            </h2>
            <p>
              Coastal views, city culture, and a change of scenery. Having your
              own motorcycle can give you flexibility to explore suitable
              destinations at your own pace.
            </p>
            <p>
              Find a little inspiration in our island guide, then check current
              access, road suitability, parking, and venue details before
              setting out.
            </p>
            <Link className="kjm-about-text-link" href="/explore-cebu">
              Explore Cebu <ArrowUpRight size={20} aria-hidden="true" />
            </Link>
          </div>
        </AboutReveal>
      </section>
      <section
        className="kjm-about-journey kjm-about-container"
        aria-labelledby="journey-title"
      >
        <AboutReveal>
          <div className="kjm-about-journey-heading">
            <div>
              <p className="kjm-about-eyebrow">THE KJM RENTAL EXPERIENCE</p>
              <h2 id="journey-title">
                Your journey starts
                <br />
                <em>with a clear plan.</em>
              </h2>
            </div>
            <p>
              A few considered steps, from finding your motorcycle to receiving
              KJM’s approval.
            </p>
          </div>
          <ol className="kjm-about-steps">
            <li>
              <span className="kjm-about-step-number" aria-hidden="true">
                01
              </span>
              <h3>Find your ride</h3>
              <p>
                Browse published motorcycle models and compare current rental
                prices to find a ride for your journey.
              </p>
              <span className="kjm-about-step-label">BROWSE / COMPARE</span>
            </li>
            <li>
              <span className="kjm-about-step-number" aria-hidden="true">
                02
              </span>
              <h3>Make it your own</h3>
              <p>
                Choose rental dates and select optional extras when booking
                access is available.
              </p>
              <span className="kjm-about-step-label">DATES / EXTRAS</span>
            </li>
            <li>
              <span className="kjm-about-step-number" aria-hidden="true">
                03
              </span>
              <h3>A considered confirmation</h3>
              <p>
                Submit your required identity and driver’s license documents for
                verification. Receive confirmation only after KJM reviews and
                approves your request.
              </p>
              <span className="kjm-about-step-label">
                VERIFY / KJM APPROVAL
              </span>
            </li>
          </ol>
          <Link className="kjm-about-text-link" href="/how-it-works">
            Read the rental process{" "}
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </AboutReveal>
      </section>
      <section
        className="kjm-about-cta kjm-about-container"
        aria-labelledby="cta-title"
      >
        <AboutReveal className="kjm-about-cta-inner">
          <div>
            <p className="kjm-about-eyebrow">THE ISLAND IS CALLING</p>
            <h2 id="cta-title">
              Ready to Explore
              <br />
              <em>the Island?</em>
            </h2>
            <p>
              Find the motorcycle that fits your journey around Mactan and Cebu.
            </p>
          </div>
          <ExploreButton secondary />
          <Waves
            className="kjm-about-cta-waves"
            size={210}
            strokeWidth={0.65}
            aria-hidden="true"
          />
        </AboutReveal>
      </section>
      <p className="kjm-about-photo-note kjm-about-container">
        Scenery is illustrated travel inspiration, not documentary photography
        of specific places, KJM premises or a promise of beach access.
      </p>
    </main>
  );
}
