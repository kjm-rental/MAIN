import type { HTMLAttributes } from "react";

export function Container({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12 ${className}`}
      {...props}
    />
  );
}
