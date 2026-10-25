import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { excerpt, getPage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Zanimljivosti",
  description: "Nekoliko zanimljivih informacija vezanih uz sudske tumače i prevođenje.",
  alternates: { canonical: "/zanimljivosti/" },
};

const CLANCI = [
  { slug: "sudski-tumac", img: "/uploads/2019/08/ovjera-400x250.webp" },
  { slug: "sto-je-apostille", img: "/uploads/2024/05/apostille_hr-1-400x250.webp" },
  { slug: "pismeno-prevodenje", img: "/uploads/2024/05/pisani.webp" },
  { slug: "usmeno-prevodenje", img: "/uploads/2024/05/usmeno.webp" },
];

export default function Zanimljivosti() {
  return (
    <PageShell title="Zanimljivosti">
      <h2 className="center heading-rule">ZANIMLJIVOSTI</h2>
      <p className="center">Nekoliko zanimljivih informacija vezanih uz sudske tumače i prevođenje</p>
      <div className="post-grid">
        {CLANCI.map(({ slug, img }) => {
          const p = getPage(slug)!;
          return (
            <Link key={slug} href={`/${slug}/`} className="post-card">
              <img src={img} alt="" loading="lazy" />
              <span className="post-card-body">
                <span className="post-card-title">{p.title}</span>
                <span className="post-card-text">{excerpt(p.html, 140)}</span>
                <span className="post-card-more">Pročitaj više</span>
              </span>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
