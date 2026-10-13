import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import type { currentTerms } from "@/lib/terms";

export function TermsAgreement({ terms }: { terms: typeof currentTerms }) {
  return (
    <main id="terms-top">
      <PageHero
        eyebrow="KJM Motorcycle Rental"
        title="Terms and Conditions"
        description={`Effective Date: ${terms.effectiveDate}`}
        compact
      />
      <Container className="py-10 sm:py-16">
        <div className="grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
          <nav
            aria-label="Terms and Conditions sections"
            className="border-deep-teal/15 bg-sand/50 rounded-2xl border p-5"
          >
            <h2 className="text-xl font-bold">In this agreement</h2>
            <ol className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-2 lg:max-h-[60vh]">
              {terms.sections.map((section) => (
                <li key={section.number}>
                  <a
                    className="text-ocean block text-sm leading-6 underline underline-offset-4"
                    href={`#section-${section.number}`}
                  >
                    {section.number}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
            <a
              className="text-ocean mt-6 block text-sm font-bold underline"
              href={`/legal/kjm-terms-${terms.version}.txt`}
              download
            >
              Download the complete agreement
            </a>
          </nav>
          <article className="max-w-3xl min-w-0">
            <p className="text-muted leading-8">{terms.intro}</p>
            <p className="text-muted mt-4 text-sm">
              Terms version: {terms.version}
            </p>
            {terms.sections.map((section) => (
              <section
                id={`section-${section.number}`}
                aria-labelledby={`heading-${section.number}`}
                key={section.number}
                className="border-deep-teal/15 mt-10 scroll-mt-28 border-t pt-7"
              >
                <h2
                  id={`heading-${section.number}`}
                  className="text-deep-teal text-xl leading-8 font-bold sm:text-2xl"
                >
                  {section.number}. {section.title}
                </h2>
                <div className="text-muted mt-4 space-y-4 leading-8">
                  {section.blocks
                    .filter((block) => block.kind === "paragraph")
                    .map((block, index) => {
                      // Section 21's list belongs between clauses 21.2 and 21.3.
                      const bullets = section.blocks.filter(
                        (item) => item.kind === "bullet",
                      );
                      return (
                        <div key={index}>
                          <p>{block.text}</p>
                          {block.text.startsWith("21.2.") &&
                            bullets.length > 0 && (
                              <ul className="mt-4 list-disc space-y-3 pl-6">
                                {bullets.map((item) => (
                                  <li key={item.text}>{item.text}</li>
                                ))}
                              </ul>
                            )}
                        </div>
                      );
                    })}
                </div>
              </section>
            ))}
            <div className="mt-10 flex flex-wrap gap-6 text-sm">
              <a href="#terms-top" className="text-ocean font-bold underline">
                Back to top
              </a>
              <Link href="/contact" className="text-ocean font-bold underline">
                Questions? Contact KJM
              </Link>
            </div>
          </article>
        </div>
      </Container>
    </main>
  );
}
