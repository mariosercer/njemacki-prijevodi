import type { MetadataRoute } from "next";
import { pageSlugs } from "@/lib/content";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const putanje = ["", "kontakt", "zanimljivosti", ...pageSlugs()];
  return putanje.map((p) => ({ url: `${SITE.url}/${p ? p + "/" : ""}` }));
}
