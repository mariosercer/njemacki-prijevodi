"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, SITE } from "@/lib/site";

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Podizbornik koji je upravo korišten ostaje zatvoren dok miš ponovno ne dođe na njegov naslov.
  const [zatvoren, setZatvoren] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    // Nakon navigacije fokus ostaje na kliknutoj poveznici i drži podizbornik otvorenim (:focus-within).
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest(".main-nav")) {
      document.activeElement.blur();
    }
  }, [pathname]);

  const isActive = (href?: string) => href === pathname;

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${SITE.name} – početna`}>
          <img src="/uploads/2024/05/logo_96x96.webp" alt="" width={48} height={48} />
          <span>
            <span className="brand-name">{SITE.name}</span>
            <span className="brand-tagline">{SITE.tagline}</span>
          </span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="glavni-izbornik"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sr-only">Izbornik</span>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <nav id="glavni-izbornik" className={`main-nav${open ? " is-open" : ""}`} aria-label="Glavni izbornik">
          <ul>
            {NAV.map((item) => (
              <li
                key={item.label}
                className={item.children ? `has-children${zatvoren === item.label ? " is-closed" : ""}` : undefined}
              >
                {item.href ? (
                  <Link href={item.href} className={isActive(item.href) ? "active" : undefined}>
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={item.children?.some((c) => isActive(c.href)) ? "active" : undefined}
                    tabIndex={0}
                    onMouseEnter={() => zatvoren === item.label && setZatvoren(null)}
                    onFocus={() => zatvoren === item.label && setZatvoren(null)}
                  >
                    {item.label}
                  </span>
                )}
                {item.children && (
                  <ul className="submenu">
                    {item.children.map((c) => (
                      <li key={c.href}>
                        <Link
                          href={c.href!}
                          className={isActive(c.href) ? "active" : undefined}
                          onClick={() => setZatvoren(item.label)}
                        >
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
