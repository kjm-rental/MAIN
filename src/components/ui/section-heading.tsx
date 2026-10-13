type SectionHeadingProps = Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}>;

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div
      className={
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"
      }
    >
      {eyebrow ? (
        <p className="text-ocean text-xs font-extrabold tracking-[0.18em] uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-deep-teal mt-3 text-3xl leading-tight font-bold tracking-[-0.035em] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted mt-5 text-base leading-7 sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
