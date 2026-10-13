"use client";
import { useEffect, useRef } from "react";

export function FooterEntrance({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (
      !node ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.style.animationDelay = `${delay}ms`;
          node.classList.add("footer-enter");
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
