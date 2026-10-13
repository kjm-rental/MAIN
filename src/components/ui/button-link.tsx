import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "light";
};

export function ButtonLink({
  className = "",
  variant = "primary",
  ...props
}: ButtonLinkProps) {
  const variantClasses = {
    primary:
      "bg-sunset text-deep-teal shadow-[0_12px_30px_rgba(18,59,66,0.16)] hover:bg-[#ffc477]",
    secondary:
      "border border-deep-teal/15 bg-white/60 text-deep-teal hover:bg-white",
    light: "bg-white text-deep-teal hover:bg-sand",
  };

  return (
    <Link
      className={`inline-flex min-h-12 items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition-all hover:-translate-y-0.5 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
