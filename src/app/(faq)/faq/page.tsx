import "@/components/website/faq-page.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Waves } from "lucide-react";
import { FaqExplorer } from "@/components/website/faq-explorer";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Rental requirements and policy summaries from KJM Motorcycle Rental’s Terms and Conditions.",
};

export default function FaqPage() {
  return (
    <main className="kjm-faq-page">
      <section className="kjm-faq-hero" aria-labelledby="faq-title">
        <div className="kjm-faq-heroCopy">
          <p className="kjm-faq-eyebrow">THE ISLAND, AT YOUR PACE</p>
          <h1 id="faq-title">
            Frequently
            <br />
            Asked <em>Questions</em>
          </h1>
          <p className="kjm-faq-intro">
            Everything you need to know before starting your island adventure
            with KJM.
          </p>
          <div className="kjm-faq-location">
            <Waves size={22} aria-hidden="true" /> Lapu-Lapu City · Mactan
            Island · Cebu
          </div>
        </div>
        <div className="kjm-faq-art" aria-hidden="true">
          <span className="kjm-faq-artLabel">A LITTLE ISLAND INSPIRATION</span>
          <svg viewBox="0 0 440 260" fill="none">
            <circle cx="310" cy="77" r="39" fill="#f6ad88" />
            <path d="M20 164Q110 108 225 159T440 149V260H0Z" fill="#c6dcd3" />
            <path d="M0 192Q100 140 223 190T440 174V260H0Z" fill="#87b6a8" />
            <path d="M0 228Q100 182 240 222T440 212V260H0Z" fill="#086d69" />
            <path
              d="M56 180Q92 125 108 72"
              stroke="#153f40"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M108 72Q72 36 36 74Q76 63 108 72ZM108 72Q132 27 174 47Q132 54 108 72ZM108 72Q144 61 169 100Q131 83 108 72ZM108 72Q78 72 63 110Q83 86 108 72Z"
              fill="#153f40"
            />
            <path
              d="M230 203Q253 194 276 203M310 228Q333 219 356 228M349 162Q367 153 385 162"
              stroke="#fcfaf6"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M211 55q8-8 16 0q8-8 16 0"
              stroke="#153f40"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="kjm-faq-artCaption">
            Good questions. Great adventures.
          </span>
        </div>
      </section>
      <section className="kjm-faq-body" aria-labelledby="answers-title">
        <FaqExplorer />
      </section>
      <section className="kjm-faq-contact" aria-labelledby="contact-title">
        <div>
          <p className="kjm-faq-eyebrow">
            YOUR NEXT ADVENTURE STARTS WITH A CONVERSATION
          </p>
          <h2 id="contact-title">Still have questions?</h2>
          <p>
            We&apos;re happy to help you plan your motorcycle adventure around
            Mactan and Cebu.
          </p>
        </div>
        <Link href="/contact">
          Contact KJM <ArrowUpRight size={20} aria-hidden="true" />
        </Link>
        <Waves
          className="kjm-faq-contactWave"
          size={180}
          strokeWidth={0.6}
          aria-hidden="true"
        />
      </section>
    </main>
  );
}
