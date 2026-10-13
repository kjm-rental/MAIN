import { Container } from "@/components/ui/container";

type PageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  compact?: boolean;
}>;

export function PageHero({
  eyebrow,
  title,
  description,
  compact = false,
}: PageHeroProps) {
  return (
    <section
      className={`bg-sand text-deep-teal relative isolate overflow-hidden ${compact ? "pt-8 pb-6 sm:pt-12 sm:pb-8" : "py-16 sm:py-24"}`}
    >
      <div
        aria-hidden="true"
        className="bg-ocean/30 absolute -top-24 -right-24 -z-10 size-80 rounded-full blur-3xl"
      />
      <Container>
        <p className="text-ocean text-xs font-extrabold tracking-[0.2em] uppercase">
          {eyebrow}
        </p>
        <h1
          className={`mt-4 leading-[1.05] font-bold tracking-[-0.045em] ${compact ? "max-w-5xl text-3xl sm:text-4xl lg:text-5xl" : "max-w-4xl text-4xl sm:text-6xl"}`}
        >
          {title}
        </h1>
        <p
          className={`text-muted max-w-2xl ${compact ? "mt-4 text-base leading-7" : "mt-6 text-lg leading-8"}`}
        >
          {description}
        </p>
      </Container>
    </section>
  );
}
