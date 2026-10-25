"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Cloudflare Turnstile (provjera da niste robot); ne prikazuje se ako ključ nije postavljen. */
export default function Turnstile({ onToken, resetKey }: { onToken: (t: string) => void; resetKey?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  function render() {
    if (!el.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(el.current, {
      sitekey: TURNSTILE_SITE_KEY,
      language: "hr",
      appearance: "interaction-only",
      callback: (t: string) => callback.current(t),
      "expired-callback": () => callback.current(""),
      "error-callback": () => callback.current(""),
    });
  }

  useEffect(() => {
    render();
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current) window.turnstile?.reset(widget.current);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={render} />
      <div ref={el} />
    </>
  );
}
