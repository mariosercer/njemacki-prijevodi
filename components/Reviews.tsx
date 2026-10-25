import reviews from "@/content/reviews.json";

export default function Reviews() {
  return (
    <div className="reviews">
      <p className="reviews-heading">SUDSKI TUMAČ ZA NJEMAČKI JEZIK - ŠERCER MARIO</p>
      <p className="reviews-score">
        <strong>5.0</strong> <span className="stars" aria-label="Ocjena 5 od 5">★★★★★</span>
      </p>
      <ul className="reviews-list">
        {reviews.map((r) => (
          <li key={r.url}>
            <p className="review-author">
              <a href={r.url} target="_blank" rel="nofollow noopener noreferrer">
                {r.author}
              </a>
            </p>
            <p className="stars" aria-label={`Ocjena ${r.rating} od 5`}>
              {"★".repeat(r.rating)}
            </p>
            <blockquote>{r.text}</blockquote>
          </li>
        ))}
      </ul>
      <p className="reviews-source">Recenzije s Google Mapsa</p>
    </div>
  );
}
