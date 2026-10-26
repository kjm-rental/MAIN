"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Container } from "@/components/ui/container";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/motorcycles", label: "Our Motorcycles" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/explore-cebu", label: "Explore Cebu" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");
  return (
    <header
      className={`coastal-header ${pathname === "/" ? "fixed inset-x-0" : "sticky"} top-0 z-50 px-3 pt-2 pb-2 sm:px-6 sm:pt-2`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <Container className="!max-w-[1440px] !px-0">
        <div className="coastal-frame overflow-hidden rounded-[1.25rem] border shadow-[0_6px_24px_rgba(18,63,67,.18)] backdrop-blur-xl sm:rounded-[1.5rem]">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              href="/"
              aria-label="KJM Motorcycle Rental home"
              onClick={() => setIsOpen(false)}
              className="group flex shrink-0 items-center gap-3"
            >
              <Image
                src="/images/brand/kjm-logo.png"
                width={1164}
                height={1351}
                alt=""
                className="h-auto w-12 shrink-0 sm:w-14"
              />
              <span>
                <span className="font-display text-deep-teal block text-[30px] leading-none font-extrabold tracking-[-.06em]">
                  KJM<span className="text-ocean ml-1">.</span>
                </span>
                <span className="text-muted mt-1 block text-[9px] font-bold tracking-[.12em] uppercase">
                  Motorcycle Rental
                </span>
              </span>
            </Link>
            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-1 xl:flex"
            >
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active(item.href) ? "page" : undefined}
                  className={`coastal-nav inline-flex min-h-11 items-center rounded-full px-3 text-xs font-bold transition-colors ${active(item.href) ? "bg-sand text-deep-teal" : "text-muted hover:bg-sand/70 hover:text-deep-teal"}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/book"
                className="group border-deep-teal/20 bg-sunset text-deep-teal hover:bg-sand hidden min-h-11 items-center gap-3 rounded-full border py-1.5 pr-1.5 pl-5 text-xs font-extrabold transition-colors sm:inline-flex"
              >
                Book your ride
                <span className="bg-deep-teal grid size-8 place-items-center rounded-full text-white">
                  <ArrowUpRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
              <button
                ref={toggle}
                type="button"
                aria-label={
                  isOpen ? "Close navigation menu" : "Open navigation menu"
                }
                aria-expanded={isOpen}
                aria-controls="mobile-navigation"
                onClick={() => setIsOpen((v) => !v)}
                className="border-deep-teal/25 text-deep-teal inline-flex min-h-11 items-center gap-2 rounded-full border bg-white px-4 text-xs font-bold xl:hidden"
              >
                <span>{isOpen ? "Close" : "Explore"}</span>
                {isOpen ? (
                  <X className="size-4" aria-hidden="true" />
                ) : (
                  <Menu className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          {isOpen && (
            <nav
              id="mobile-navigation"
              aria-label="Mobile navigation"
              className="border-deep-teal/15 bg-off-white max-h-[calc(100dvh-150px)] overflow-y-auto border-t p-4 sm:p-6 xl:hidden"
            >
              <p className="text-ocean mb-3 text-[10px] font-extrabold tracking-[.16em] uppercase">
                Find your island rhythm
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                {navigation.map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active(item.href) ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                    className={`coastal-nav flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 transition-colors ${active(item.href) ? "bg-sand text-deep-teal" : "text-deep-teal hover:bg-sand/70"}`}
                  >
                    <span className="text-muted text-[10px] font-bold">
                      0{index + 1}
                    </span>
                    <span className="font-display text-lg font-semibold">
                      {item.label}
                    </span>
                    <ArrowUpRight
                      className="text-ocean ml-auto size-4"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
              <Link
                href="/book"
                onClick={() => setIsOpen(false)}
                className="border-deep-teal/20 bg-sunset text-deep-teal mt-4 flex min-h-12 items-center justify-between rounded-xl border px-5 text-sm font-extrabold"
              >
                Book your ride
                <ArrowUpRight className="size-5" aria-hidden="true" />
              </Link>
              <p className="text-muted mt-4 text-center text-[10px] font-bold tracking-widest uppercase">
                Mactan Island · Cebu, Philippines
              </p>
            </nav>
          )}
        </div>
      </Container>
    </header>
  );
}
