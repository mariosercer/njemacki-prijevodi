import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { excerpt, getPage, pageSlugs } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return pageSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: excerpt(page.html),
    alternates: { canonical: `/${slug}/` },
    openGraph: { title: page.title, type: page.type === "post" ? "article" : "website" },
  };
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) notFound();
  return (
    <PageShell title={page.title}>
      <div className="content" dangerouslySetInnerHTML={{ __html: page.html }} />
    </PageShell>
  );
}
