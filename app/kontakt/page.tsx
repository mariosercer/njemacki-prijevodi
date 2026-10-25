import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import PageShell from "@/components/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontaktirajte sudskog tumača za njemački jezik Marija Šercera – Varaždinska 3, Nedelišće.",
  alternates: { canonical: "/kontakt/" },
};

export default function Kontakt() {
  return (
    <PageShell title="Kontakt">
      <div className="contact-page">
        <div>
          <blockquote>
            <h6>GDJE SMO?</h6>
            <p>
              Nalazimo se u Nedelišću, na glavnoj cesti točno preko puta Metssa, na raskršću gdje se odvaja cesta za
              Maribor (SLO).
            </p>
            <p>
              <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer">
                Otvori u Google Maps
              </a>
            </p>
          </blockquote>
          <h6>RADNO VRIJEME:</h6>
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
        <ContactForm />
      </div>
    </PageShell>
  );
}
