/**
 * /vs/[a]/[b] — 1:1 company comparison.
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature B).
 *
 * Routing contract:
 *   - `[a]` and `[b]` are company `slug` values (lowercase alphanumeric)
 *   - canonical lex order: a.slug < b.slug
 *   - reverse-order URLs (e.g. /vs/socar/swm when canonical is /vs/socar/swm
 *     ... wait that IS canonical) — so /vs/swm/socar would redirect to
 *     /vs/socar/swm via permanent redirect. Keeps SSG count at C(n,2)=45,
 *     not n*(n-1)=90.
 *
 * SSG strategy: generateStaticParams emits all 45 canonical pairs. Each page
 * is fully static — no client work needed beyond the small CompareSwitcher
 * interactivity island.
 *
 * Why no /vs/[a] single-arg page: the experience is comparison, not a
 * landing. If a user wants single-company info, that's /company/[id].
 */
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import {
  canonicalPair,
  getAllCompanies,
  getAllCompanyPairs,
  getCompanyBySlug,
} from "@/lib/companies";
import ComparisonView from "@/components/vs/ComparisonView";
import CompareSwitcher from "@/components/vs/CompareSwitcher";

// dynamicParams stays at the default (true). generateStaticParams only emits
// the 45 canonical lex-sorted pairs (so SSG builds those at build time);
// reverse-order requests fall through to runtime where the page-level
// permanentRedirect rewrites to canonical. Setting dynamicParams=false would
// 404 the reverse-order URLs *before* our redirect could fire — bad UX since
// users could type either order in their address bar.
export function generateStaticParams() {
  return getAllCompanyPairs().map(([a, b]) => ({ a, b }));
}

interface PageParams {
  params: { a: string; b: string };
}

export function generateMetadata({ params }: PageParams): Metadata {
  const a = getCompanyBySlug(params.a);
  const b = getCompanyBySlug(params.b);
  if (!a || !b) return { title: "기업 비교" };

  const title = `${a.name} vs ${b.name} — 자율주행 1:1 비교`;
  const description =
    `${a.name}과 ${b.name}의 자율주행 현황 1:1 비교. ` +
    `SAE Level, 차량 규모, 누적 투자, 운행 구역, 핵심 마일스톤을 한눈에.`;
  const url = `/vs/${a.slug}/${b.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: `${a.name} vs ${b.name}`,
      description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${a.name} vs ${b.name}`,
      description,
    },
  };
}

export default function VersusPage({ params }: PageParams) {
  // Reverse-order request → permanent redirect to canonical lex-sorted URL.
  // This keeps Google + bookmarks pointing at one URL per pair.
  const [canonA, canonB] = canonicalPair(params.a, params.b);
  if (params.a !== canonA || params.b !== canonB) {
    permanentRedirect(`/vs/${canonA}/${canonB}`);
  }

  const a = getCompanyBySlug(params.a);
  const b = getCompanyBySlug(params.b);
  if (!a || !b || a.id === b.id) notFound();

  // JSON-LD: ComparisonItem-ish schema. Search engines won't render a special
  // card for it (no schema.org for "comparison page" yet) but it doesn't hurt
  // crawlers and pairs nicely with the company /company/[id] Organization
  // schema we already emit.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${a.name} vs ${b.name}`,
    about: [
      { "@type": "Organization", name: a.name, url: a.website || undefined },
      { "@type": "Organization", name: b.name, url: b.website || undefined },
    ],
    inLanguage: "ko-KR",
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">
          대시보드
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">기업 비교</span>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">
          {a.name} vs {b.name}
        </span>
      </nav>

      <CompareSwitcher
        companies={getAllCompanies()}
        currentA={a.slug as string}
        currentB={b.slug as string}
      />

      <ComparisonView a={a} b={b} />
    </div>
  );
}
