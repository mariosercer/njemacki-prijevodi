import Link from "next/link";
import Kalkulator from "@/components/Kalkulator";
import Reviews from "@/components/Reviews";
import { MailIcon, PeopleIcon, PersonIcon, PhoneIcon, StampIcon } from "@/components/Icons";
import { SITE } from "@/lib/site";

const DOSTAVA = [
  { img: "/uploads/2025/02/mail.webp", naslov: "Dostava mailom" },
  { img: "/uploads/2025/02/post.webp", naslov: "Dostava poštom" },
  { img: "/uploads/2025/02/person.webp", naslov: "Osobno preuzimanje" },
];

const USLUGE = [
  {
    href: "/fizicke-osobe/",
    naslov: "Usluge prijevoda za fizičke osobe",
    opis: "Brz, kvalitetan i povoljan prijevod sve vrste dokumentacije.",
    ikona: <PersonIcon />,
  },
  {
    href: "/pravne-osobe/",
    naslov: "Usluge prijevoda za pravne osobe",
    opis: "Prijevodi poslovne dokumentacije, korespondencije, financijske dokumentacije, web-stranica, svih vrsta obrazaca…",
    ikona: <PeopleIcon />,
  },
  {
    href: "/ovjereni-prijevodi/",
    naslov: "Ovjereni prijevodi sudskog tumača za njemački jezik",
    opis: "Prijevodi svih vrsta službenih dokumenata koje je potrebno ovjeriti pečatom i potpisom ovlaštenog sudskog tumača",
    ikona: <StampIcon />,
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>
          Stalni sudski tumač
          <br />
          za njemački jezik
        </h1>
      </section>

      <section className="section">
        <div className="container narrow">
          <p className="center intro">
            Trebate prijevod s njemačkog jezika na hrvatski ili obrnuto? Ovdje ste na pravom mjestu. Prevodimo brzo,
            pouzdano i povoljno. Uz širok spektar područja koje pokrivamo specijalizirani smo u prevođenju na području
            tehničkih znanosti, ekonomije i prava. Obratite nam se s povjerenjem!
          </p>
          <Kalkulator
            prikaz="javni"
            ponudaUrl="/api/ponuda/"
            ponudaToken="-"
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </div>
      </section>

      <section className="section section-blue">
        <div className="container">
          <h2 className="section-title">Odaberite način dostave koji vam najviše odgovara</h2>
          <div className="grid-3">
            {DOSTAVA.map((d) => (
              <Link key={d.naslov} href="/trosak-dostave/" className="delivery-card">
                <span className="delivery-img">
                  <img src={d.img} alt="" width={300} height={300} loading="lazy" />
                </span>
                <span className="delivery-title">{d.naslov}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title dark">Brzo, kvalitetno i pouzdano</h2>
          <Reviews />
        </div>
      </section>

      <section className="section section-blue">
        <div className="container">
          <h2 className="section-title">Sve vrste prijevoda</h2>
          <p className="center section-sub">Obratite nam se s povjerenjem</p>
          <div className="grid-3">
            {USLUGE.map((u) => (
              <Link key={u.href} href={u.href} className="service">
                <span className="service-icon">{u.ikona}</span>
                <span className="service-title">{u.naslov}</span>
                <span className="service-text">{u.opis}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title dark">Javite nam se</h2>
          <div className="grid-3 contact-row">
            <a href={`mailto:${SITE.email}`} className="contact-item">
              <MailIcon size={64} />
              <span>{SITE.email}</span>
            </a>
            <a href={`tel:${SITE.phoneIntl}`} className="contact-item">
              <PhoneIcon size={64} />
              <span>{SITE.phoneDisplayIntl}</span>
            </a>
            <div className="contact-item">
              <Link href="/kontakt/" className="btn">
                Kontakt
              </Link>
              <span>Kontakt obrazac</span>
            </div>
          </div>
          <p className="center tagline-strong">
            <strong>POVOLJNO, KVALITETNO I UVIJEK NA VRIJEME – OBRATITE SE S POVJERENJEM</strong>
          </p>
        </div>
      </section>
    </>
  );
}
