import spremljene from "@/content/reviews.json";

export type Recenzija = { author: string; url: string; rating: number; time: string; text: string };
export type Recenzije = { ocjena: number; ukupno: number | null; url: string | null; recenzije: Recenzija[] };

const PLACE_ID = "ChIJ83Iug9CsaEcRQyyaMf_xiSc";

// Rezervni sadržaj ako Google nije dostupan ili ključ nije postavljen.
const REZERVA: Recenzije = { ocjena: 5, ukupno: null, url: null, recenzije: spremljene };

type GoogleOdgovor = {
  status: string;
  result?: {
    rating?: number;
    user_ratings_total?: number;
    url?: string;
    reviews?: {
      author_name: string;
      author_url: string;
      rating: number;
      relative_time_description: string;
      text: string;
    }[];
  };
};

/** Recenzije s Google Mapsa (Places API), osvježavaju se jednom dnevno. */
export async function dohvatiRecenzije(): Promise<Recenzije> {
  const kljuc = process.env.GOOGLE_PLACES_API_KEY;
  if (!kljuc) return REZERVA;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.search = new URLSearchParams({
    place_id: PLACE_ID,
    fields: "rating,user_ratings_total,reviews,url",
    language: "hr",
    reviews_sort: "newest",
    reviews_no_translations: "true",
    key: kljuc,
  }).toString();

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    const o = (await res.json()) as GoogleOdgovor;
    if (o.status !== "OK" || !o.result) {
      console.error("Google recenzije: neočekivan odgovor", o.status);
      return REZERVA;
    }
    // Prikazuju se samo dobre recenzije s tekstom (ocjena bez teksta nema što pokazati).
    const recenzije = (o.result.reviews ?? [])
      .filter((r) => r.text?.trim() && r.rating >= 4)
      .map((r) => ({
        author: r.author_name,
        url: r.author_url,
        rating: r.rating,
        time: r.relative_time_description,
        text: r.text.trim(),
      }));
    if (!recenzije.length) return REZERVA;
    return {
      ocjena: o.result.rating ?? 5,
      ukupno: o.result.user_ratings_total ?? null,
      url: o.result.url ?? null,
      recenzije,
    };
  } catch (e) {
    console.error("Google recenzije nisu dohvaćene", e);
    return REZERVA;
  }
}
