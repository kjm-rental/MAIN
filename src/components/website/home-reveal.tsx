"use client";
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import styles from "./home-motion.module.css";
export function HomeReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
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
        if (entries.some((e) => e.isIntersecting)) {
          node.classList.add(styles.reveal);
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{ animationDelay: `${Math.min(delay, 180)}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
