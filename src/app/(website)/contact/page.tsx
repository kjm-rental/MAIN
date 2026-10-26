import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowUpRight,
  ArrowRight,
  Mail,
  MapPin,
  Phone,
  Compass,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button-link";
import { WhatsAppIcon } from "@/components/website/whatsapp-button";
import {
  businessContact,
  directionsUrl,
  whatsappUrl,
} from "@/lib/content/business-contact";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact KJM Motorcycle Rental by phone, email or WhatsApp to plan your motorcycle rental in Lapu-Lapu City, Cebu.",
};
const chatUrl = whatsappUrl(
  "Hello KJM Motorcycle Rental! I would like to ask about renting a motorcycle.",
);
const external = { target: "_blank", rel: "noopener noreferrer" } as const;
const chatButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-[#063b2c] transition-colors hover:bg-[#52e58a]";

export default function ContactPage() {
  return (
    <main className="bg-[#faf7f0]">
      <section className="bg-deep-teal relative isolate overflow-hidden text-white">
        <Image
          src="/images/island/cebu-coastal-ride-v2.webp"
          alt="Helmeted motorcycle rider beside turquoise coastal waters and tropical palms"
          fill
          preload
          quality={90}
          sizes="100vw"
          className="-z-20 object-cover object-[65%_center]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,36,39,.94),rgba(5,36,39,.72)_45%,rgba(5,36,39,.15))] max-sm:bg-[linear-gradient(90deg,rgba(5,36,39,.87),rgba(5,36,39,.55))]"
        />
        <Container className="py-10 sm:py-14 lg:py-16">
          <div className="max-w-xl">
            <p className="text-sunset text-[10px] font-extrabold tracking-[.15em] uppercase sm:text-xs">
              Contact KJM · Cebu, Philippines
            </p>
            <h1 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] font-bold tracking-[-.04em]">
              Your Cebu Adventure{" "}
              <span className="text-sunset">Starts Here.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/85 sm:text-base sm:leading-7">
              Questions about our motorcycles or your upcoming ride? We&apos;re
              just a message away.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={chatUrl} {...external} className={chatButton}>
                <WhatsAppIcon className="size-5 shrink-0" />
                Chat on WhatsApp
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </a>
              <a
                href={businessContact.telephoneUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-3 text-sm font-bold backdrop-blur-sm hover:bg-white/20"
              >
                <Phone aria-hidden="true" className="size-4" />
                Call Us
              </a>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-9 sm:py-12">
        <Container>
          <div className="mb-6 max-w-xl">
            <p className="text-ocean text-[10px] font-extrabold tracking-[.16em] uppercase">
              A local team. Your next adventure.
            </p>
            <h2 className="text-deep-teal mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Let&apos;s Get You Riding
            </h2>
            <p className="text-muted mt-3 text-sm leading-6">
              Reach out anytime with questions about rentals, availability, or
              your Cebu adventure.
            </p>
          </div>
          <div className="grid items-stretch gap-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="border-deep-teal/10 order-2 min-w-0 rounded-[1.75rem] border bg-white px-5 shadow-[0_8px_30px_rgba(18,63,67,.04)] sm:px-7 lg:order-1">
              <div className="border-deep-teal/10 flex gap-4 border-b py-5">
                <Phone
                  aria-hidden="true"
                  className="text-ocean mt-1 size-5 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-muted text-xs font-bold">Phone</h3>
                  <a
                    href={businessContact.telephoneUrl}
                    className="text-deep-teal inline-flex min-h-11 items-center text-lg font-bold hover:underline"
                  >
                    {businessContact.phone}
                  </a>
                </div>
              </div>
              <div className="border-deep-teal/10 flex gap-4 border-b py-5">
                <Mail
                  aria-hidden="true"
                  className="text-ocean mt-1 size-5 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-muted text-xs font-bold">Email</h3>
                  <a
                    href={`mailto:${businessContact.email}`}
                    className="text-deep-teal inline-flex min-h-11 items-center text-sm font-bold [overflow-wrap:anywhere] hover:underline sm:text-base"
                  >
                    {businessContact.email}
                  </a>
                </div>
              </div>
              <div className="flex gap-4 py-5">
                <MapPin
                  aria-hidden="true"
                  className="text-ocean mt-1 size-5 shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-muted text-xs font-bold">
                    Registered Business Address
                  </h3>
                  <p className="text-deep-teal mt-2 text-sm leading-6">
                    {businessContact.address}
                  </p>
                  <a
                    href={directionsUrl}
                    {...external}
                    className="text-ocean inline-flex min-h-11 items-center gap-2 text-sm font-bold hover:underline"
                  >
                    Get Directions
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </a>
                  <p className="text-muted text-xs leading-5">
                    Please confirm your pickup location with KJM when arranging
                    your rental.
                  </p>
                </div>
              </div>
            </div>
            <aside className="bg-deep-teal relative isolate order-1 flex min-w-0 flex-col justify-center overflow-hidden rounded-[1.75rem] p-6 text-white sm:p-8 lg:order-2">
              <div
                aria-hidden="true"
                className="absolute -top-16 -right-16 -z-10 size-64 rounded-full border-[40px] border-white/5"
              />
              <span className="grid size-14 place-items-center rounded-2xl bg-[#25D366]/15 text-[#52e58a]">
                <WhatsAppIcon className="size-8" />
              </span>
              <h3 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
                Need Help? Let&apos;s Chat!
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
                Choosing a motorcycle or planning your rental? Message our team
                directly on WhatsApp.
              </p>
              <a
                href={chatUrl}
                {...external}
                className={`${chatButton} mt-6 self-start`}
              >
                Start WhatsApp Chat
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
              </a>
              <p className="mt-4 text-sm text-white/70">
                {businessContact.internationalPhone}
              </p>
            </aside>
          </div>
        </Container>
      </section>

      <section className="pb-10 sm:pb-12">
        <Container>
          <div className="border-deep-teal/10 flex flex-col items-start gap-5 rounded-[1.5rem] border bg-[#efe9dc] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-start gap-4">
              <Compass
                aria-hidden="true"
                className="text-ocean mt-1 hidden size-9 shrink-0 sm:block"
              />
              <div>
                <h2 className="text-deep-teal text-2xl font-bold tracking-tight">
                  Ready to Hit the Road?
                </h2>
                <p className="text-muted mt-2 text-sm leading-6">
                  Explore our motorcycles and discover Cebu at your own pace.
                </p>
              </div>
            </div>
            <ButtonLink href="/motorcycles" className="shrink-0 gap-2">
              Explore Motorcycles
              <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          </div>
        </Container>
      </section>
    </main>
  );
}
