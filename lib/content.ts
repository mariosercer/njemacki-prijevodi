import pages from "@/content/pages.json";

export type Page = { title: string; type: "page" | "post"; html: string };

const all = pages as Record<string, Page>;

export function getPage(slug: string): Page | undefined {
  return all[slug];
}

export function pageSlugs(): string[] {
  return Object.keys(all);
}

/** Prvi odlomak teksta, za meta opis i pregled članaka. */
export function excerpt(html: string, max = 160): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, text.lastIndexOf(" ", max)) + "…" : text;
}
