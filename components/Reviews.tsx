import { dohvatiRecenzije } from "@/lib/google-recenzije";

function oblikOcjena(n: number) {
  const d = n % 10;
  const s = n % 100;
  if (d === 1 && s !== 11) return "ocjena";
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return "ocjene";
  return "ocjena";
}

export default async function Reviews() {
  const { ocjena, ukupno, url, recenzije } = await dohvatiRecenzije();
  const prikaz = ocjena.toLocaleString("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="reviews">
      <p className="reviews-heading">SUDSKI TUMAČ ZA NJEMAČKI JEZIK - ŠERCER MARIO</p>
      <p className="reviews-score">
        <strong>{prikaz}</strong>{" "}
        <span className="stars" aria-label={`Ocjena ${prikaz} od 5`}>
          {"★".repeat(Math.round(ocjena))}
        </span>
        {ukupno && <span className="reviews-count"> ({ukupno} {oblikOcjena(ukupno)} na Googleu)</span>}
      </p>
      <ul className="reviews-list">
        {recenzije.slice(0, 4).map((r) => (
          <li key={r.url + r.time}>
            <p className="review-author">
              <a href={r.url} target="_blank" rel="nofollow noopener noreferrer">
                {r.author}
              </a>
            </p>
            <p className="stars" aria-label={`Ocjena ${r.rating} od 5`}>
              {"★".repeat(r.rating)} <span className="review-time">{r.time}</span>
            </p>
            <blockquote>{r.text}</blockquote>
          </li>
        ))}
      </ul>
      <p className="reviews-source">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            Sve recenzije na Google Mapsu
          </a>
        ) : (
          "Recenzije s Google Mapsa"
        )}
      </p>
    </div>
  );
}
