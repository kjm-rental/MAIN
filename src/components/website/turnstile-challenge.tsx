"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme: "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileChallenge({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !siteKey || !container.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
      theme: "auto",
    });
    return () => {
      if (widgetId.current && window.turnstile)
        window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [onToken, ready, siteKey]);

  if (!siteKey)
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
        Secure guest verification is not configured. Booking submission remains
        disabled.
      </p>
    );

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={container} aria-label="Human verification challenge" />
    </>
  );
}
