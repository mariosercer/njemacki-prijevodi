import type { Metadata } from "next";
import { PhoneIcon } from "@/components/Icons";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Vizitka",
  robots: { index: false, follow: false },
};

export default function Vizitka() {
  return (
    <div className="vizitka">
      <div className="vizitka-card">
        <img src="/uploads/2026/02/mario.png" alt="Mario Šercer" width={142} height={142} />
        <h1>Mario Šercer</h1>
        <p>Metalska jezgra Čakovec</p>
        <p>
          <a href={`tel:${SITE.phoneIntl}`}>+385 98 9070591</a>
        </p>
        <p>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </p>
      </div>
      <a className="vizitka-save" href="/mario-sercer.vcf" download>
        <PhoneIcon size={22} /> SPREMI KONTAKT
      </a>
    </div>
  );
}
