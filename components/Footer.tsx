import Link from "next/link";
import { SITE } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-widgets">
        <div>
          <h4>Radno vrijeme</h4>
          <p>
            Radnim danom nakon 16:30 sati
            <br />
            (poželjno uz prethodnu najavu)
          </p>
          <p>
            Subotom od 9:00 do 14:00
            <br />
            (poželjno uz prethodnu najavu)
          </p>
        </div>
        <div>
          <h4>Kontakt</h4>
          <p>
            <strong>Telefon:</strong>
            <br />
            <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a>
          </p>
          <p>
            <strong>E-mail:</strong>
            <br />
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </p>
        </div>
        <div>
          <h4>Lokacija</h4>
          <p>
            <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer">
              Otvori u Google Maps
            </a>
          </p>
        </div>
        <div>
          <h4>Adresa</h4>
          <p>{SITE.address[0]}</p>
          <p>{SITE.address[1]}</p>
        </div>
      </div>
      <div className="footer-bottom">
        <Link href="/izjava-o-privatnosti/">Izjava o privatnosti</Link>
        <Link href="/upotreba-kolacica/">Upotreba kolačića</Link>
      </div>
    </footer>
  );
}
