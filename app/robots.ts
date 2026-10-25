import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/izracun-cijene/", "/vizitka/", "/api/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
