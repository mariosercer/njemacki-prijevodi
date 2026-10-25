import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Iste adrese kao na WordPressu (sa završnom kosom crtom) – važno za Google.
  trailingSlash: true,
  async redirects() {
    return [
      // Stare adrese slika i datoteka iz WordPressa
      { source: "/storage/:path*", destination: "/uploads/:path*", permanent: true },
      { source: "/wp-content/uploads/:path*", destination: "/uploads/:path*", permanent: true },
      { source: "/test/mario-sercer.vcf", destination: "/mario-sercer.vcf", permanent: true },
      // Stari oblik adresa članaka (/2019/08/12/naziv/)
      { source: "/:y(\\d{4})/:m(\\d{2})/:d(\\d{2})/:slug", destination: "/:slug/", permanent: true },
      // Stranice koje više ne postoje
      { source: "/wp-file-download-search", destination: "/", permanent: true },
      { source: "/feed", destination: "/", permanent: true },
      { source: "/wp-admin/:path*", destination: "/", permanent: false },
      { source: "/wp-login.php", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
