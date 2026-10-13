import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, Waves } from "lucide-react";
import { Container } from "@/components/ui/container";
import { CurrentYear } from "@/components/ui/current-year";
import { FooterEntrance } from "@/components/layout/footer-entrance";

const footerLinks = [
  { href: "/motorcycles", label: "Motorcycles" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/explore-cebu", label: "Explore Cebu" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
  { href: "/about", label: "About KJM" },
] as const;

export function SiteFooter() {
  return (
    <footer className="island-footer">
      <div className="footer-invitation">
        <Container className="flex flex-col gap-6 py-9 sm:flex-row sm:items-center sm:justify-between sm:py-11">
          <FooterEntrance className="flex items-center gap-4">
            <Waves
              className="footer-coral size-9 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="footer-light-muted text-[10px] font-bold tracking-[.16em] uppercase">
                Mactan Island · Cebu
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                More island. More freedom.
              </h2>
            </div>
          </FooterEntrance>
          <Link
            href="/motorcycles"
            className="footer-ride group inline-flex min-h-12 items-center justify-between gap-6 self-start rounded-full px-6 py-3 text-sm font-bold sm:self-auto"
          >
            Find your ride
            <ArrowUpRight className="footer-arrow size-5" aria-hidden="true" />
          </Link>
        </Container>
      </div>
      <div className="footer-wave" aria-hidden="true">
        <svg
          className="footer-wave-drift"
          viewBox="0 0 1440 48"
          preserveAspectRatio="none"
        >
          <path
            d="M0 23C180 46 280 0 480 19S760 48 960 23 1260 5 1440 24V48H0Z"
            fill="#143F40"
          />
          <path
            d="M0 23C180 46 280 0 480 19S760 48 960 23 1260 5 1440 24"
            stroke="#F6A783"
            strokeWidth="1.5"
            fill="none"
            opacity=".65"
          />
        </svg>
      </div>
      <Container className="grid gap-8 py-9 sm:grid-cols-2 lg:grid-cols-[1.15fr_1fr_.65fr] lg:gap-12">
        <FooterEntrance>
          <Link
            href="/"
            aria-label="KJM Motorcycle Rental home"
            className="footer-brand inline-flex items-center gap-3"
          >
            <Image
              src="/images/brand/kjm-logo.png"
              width={1164}
              height={1351}
              alt=""
              className="h-auto w-32 shrink-0 rounded-2xl bg-[#FAF7F0] p-3"
            />
          </Link>
          <p className="footer-secondary mt-5 max-w-xs text-sm leading-6">
            Motorcycle rentals in Lapu-Lapu City, Mactan Island, Cebu.
          </p>
          <p className="footer-secondary mt-3 max-w-xs text-sm leading-6">
            Find your ride. Take the island at your own pace.
          </p>
        </FooterEntrance>
        <FooterEntrance delay={70}>
          <h2 className="text-[11px] font-bold tracking-[.15em] uppercase">
            Explore the journey
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-5">
            {footerLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="footer-link inline-flex min-h-11 items-center text-sm"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </FooterEntrance>
        <FooterEntrance delay={140}>
          <h2 className="text-[11px] font-bold tracking-[.15em] uppercase">
            Before you ride
          </h2>
          <ul className="mt-3">
            <li>
              <Link
                href="/terms"
                className="footer-link inline-flex min-h-11 items-center text-sm"
              >
                Terms draft
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="footer-link inline-flex min-h-11 items-center text-sm"
              >
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link
                href="/photo-credits"
                className="footer-link inline-flex min-h-11 items-center text-sm"
              >
                Photo credits
              </Link>
            </li>
          </ul>
          <Link
            href="/contact"
            className="footer-contact footer-link mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold"
          >
            Talk to KJM
            <ArrowUpRight className="footer-arrow size-4" aria-hidden="true" />
          </Link>
        </FooterEntrance>
      </Container>
      <div className="footer-bottom">
        <Container className="footer-secondary flex flex-col gap-2 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            ©{" "}
            <Suspense fallback="2026">
              <CurrentYear />
            </Suspense>{" "}
            KJM Motorcycle Rental
          </p>
          <p>Lapu-Lapu City, Cebu, Philippines</p>
        </Container>
      </div>
    </footer>
  );
}
