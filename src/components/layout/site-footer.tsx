import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Mail, MapPin, Phone, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { CurrentYear } from "@/components/ui/current-year";
import { businessContact, directionsUrl } from "@/lib/content/business-contact";

const groups = [
  {
    title: "Explore",
    links: [
      ["/motorcycles", "Our Motorcycles"],
      ["/how-it-works", "How It Works"],
      ["/explore-cebu", "Explore Cebu"],
      ["/about", "About KJM"],
    ],
  },
  {
    title: "Information",
    links: [
      ["/faq", "FAQ"],
      ["/contact", "Contact"],
      ["/terms", "Terms & Conditions (draft)"],
      ["/privacy", "Privacy Policy"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="island-footer">
      <Container>
        <div className="footer-intro">
          <p>
            <span className="footer-status-dot" /> Rooted in Cebu. Ready for
            your next ride.
          </p>
          <span className="footer-location-pill">
            <MapPin size={13} aria-hidden="true" /> Lapu-Lapu City, Philippines
          </span>
        </div>
      </Container>
      <Container className="footer-grid">
        <div className="footer-brand-column">
          <Link
            href="/"
            aria-label="KJM Motorcycle Rental home"
            className="footer-brand-lockup"
          >
            <Image
              src="/images/brand/kjm-logo.png"
              width={1164}
              height={1351}
              sizes="54px"
              alt="KJM Motorcycle Rental"
              className="h-auto w-[54px]"
            />
            <span className="footer-brand-wordmark">
              KJM<span>Motorcycle Rental</span>
            </span>
          </Link>
          <p className="footer-secondary mt-3 max-w-[28ch] text-sm leading-relaxed">
            Good rides. Great island days. Explore Cebu with a little more
            freedom and a local team along for the journey.
          </p>
          <a
            href={businessContact.website}
            className="footer-domain footer-link mt-3 inline-flex min-h-11 items-center gap-2 text-xs"
          >
            kjmride.com <ArrowRight size={13} aria-hidden="true" />
          </a>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={`Footer ${group.title}`}>
            <h2 className="footer-heading">{group.title}</h2>
            <ul className="mt-2">
              {group.links.map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="footer-link footer-nav-link inline-flex min-h-10 items-center text-sm leading-snug"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="footer-contact-column">
          <h2 className="footer-heading">Let’s talk about your ride</h2>
          <address className="footer-secondary mt-2 text-[13px] leading-relaxed not-italic">
            <a
              href={businessContact.telephoneUrl}
              className="footer-link footer-contact-card flex min-h-11 items-center gap-3"
            >
              <Phone className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                <small className="footer-contact-label">Call our team</small>
                {businessContact.phone}
              </span>
            </a>
            <a
              href={`mailto:${businessContact.email}`}
              className="footer-link footer-contact-card flex min-h-11 items-center gap-3"
            >
              <Mail className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <small className="footer-contact-label">Send us an email</small>
                {businessContact.email}
              </span>
            </a>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex min-h-11 items-start gap-2.5 hover:underline"
            >
              <MapPin className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
              <p>
                <span className="mb-1 block text-[10px] font-medium tracking-wide uppercase">
                  Branch location · Get directions
                </span>
                {businessContact.branchAddress}
              </p>
            </a>
          </address>
          <a
            href="https://wa.me/639752984845"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-whatsapp mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold"
          >
            <MessageCircle size={16} aria-hidden="true" /> Chat on WhatsApp{" "}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </Container>
      <div className="footer-bottom">
        <Container className="footer-bottom-content footer-secondary flex flex-col gap-1 py-4 text-[11px] leading-relaxed sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p>
            ©{" "}
            <Suspense fallback={null}>
              <CurrentYear />
            </Suspense>{" "}
            KJM Motorcycle Rental. All rights reserved.
          </p>
          <p>Lapu-Lapu City · Cebu · Philippines</p>
        </Container>
      </div>
    </footer>
  );
}
