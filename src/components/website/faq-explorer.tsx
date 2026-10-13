"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Waves } from "lucide-react";
import { FAQ_ITEMS } from "./faq-content";

const groups = [
  { title: "Booking & Reservations", indices: [2, 4, 6] },
  { title: "Payments & Deposits", indices: [1] },
  { title: "Rental Requirements", indices: [0] },
  { title: "General Questions", indices: [3, 5, 7] },
];

export function FaqExplorer() {
  const [selected, setSelected] = useState("All questions");
  return (
    <div className="kjm-faq-explorer">
      <aside className="kjm-faq-sidebar">
        <p className="kjm-faq-eyebrow">BEFORE YOU RIDE</p>
        <h2 id="answers-title">Let’s clear things up.</h2>
        <p>
          Choose a topic, or browse all our questions. A little preparation goes
          a long way.
        </p>
        <nav
          className="kjm-faq-filters"
          aria-label="Filter frequently asked questions"
        >
          {["All questions", ...groups.map((group) => group.title)].map(
            (title) => (
              <button
                key={title}
                type="button"
                aria-pressed={selected === title}
                aria-controls="faq-results"
                onClick={() => setSelected(title)}
              >
                {title}
                <span aria-hidden="true">↗</span>
              </button>
            ),
          )}
        </nav>
        <noscript>
          <style>{`[aria-label="Filter frequently asked questions"] { display: none; }`}</style>
          <p>
            All categories are shown below. Open a question to read its answer.
          </p>
        </noscript>
        <div className="kjm-faq-note">
          <Waves size={24} aria-hidden="true" />
          <strong>Good to know</strong>
          <p>
            Read the complete Terms and Conditions and ask KJM to confirm any
            booking-specific fees, insurance or special arrangements.
          </p>
          <Link href="/contact">
            Talk to KJM <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <div className="kjm-faq-results">
        <p className="kjm-faq-resultCount" role="status">
          {selected === "All questions"
            ? `${FAQ_ITEMS.length} questions · All topics`
            : `${groups.find((group) => group.title === selected)?.indices.length} ${groups.find((group) => group.title === selected)?.indices.length === 1 ? "question" : "questions"} · ${selected}`}
        </p>
        <div id="faq-results">
          {groups.map((group, groupIndex) => (
            <section
              key={group.title}
              hidden={selected !== "All questions" && selected !== group.title}
              className="kjm-faq-group"
              aria-labelledby={`faq-group-${groupIndex}`}
            >
              <h3 id={`faq-group-${groupIndex}`}>
                <span>0{groupIndex + 1}</span>
                {group.title}
              </h3>
              {group.indices.map((index) => (
                <details
                  className="kjm-faq-question"
                  key={FAQ_ITEMS[index].question}
                >
                  <summary>
                    {FAQ_ITEMS[index].question}
                    <span className="kjm-faq-indicator" aria-hidden="true" />
                  </summary>
                  <div className="kjm-faq-answer">
                    <p>{FAQ_ITEMS[index].answer}</p>
                    <Link
                      href="/terms"
                      className="text-ocean mt-3 inline-block font-bold underline"
                    >
                      Read the complete Terms and Conditions
                    </Link>
                  </div>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
