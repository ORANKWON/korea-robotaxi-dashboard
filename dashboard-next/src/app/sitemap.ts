import type { MetadataRoute } from "next";
import companiesData from "@data/companies.json";
import { getAllCompanyPairs } from "@/lib/companies";
import { getDailyArchive, getMonthlyArchive } from "@/lib/news-archive";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://korea-robotaxi-dashboard.vercel.app";

interface CompanyEntry {
  id: number;
  updated_at: string;
}

const companies = companiesData as CompanyEntry[];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/news`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/archive`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/map`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/timeline`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];

  const companyPages: MetadataRoute.Sitemap = companies.map((c) => ({
    url: `${SITE_URL}/company/${c.id}`,
    lastModified: c.updated_at,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // /vs/[a]/[b] — every C(n,2) pair, canonical lex order. Lower priority
  // than the /company/[id] hubs since these are derived views, but still
  // useful for long-tail "X vs Y" search intent.
  const versusPages: MetadataRoute.Sitemap = getAllCompanyPairs().map(([a, b]) => ({
    url: `${SITE_URL}/vs/${a}/${b}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // /archive/[YYYY-MM-DD] — every day in the corpus. Locked-in by
  // /plan-eng-review 2026-05-11 (news-archive-v1). lastModified = the date
  // itself (KST midnight) so search engines treat each day as static once
  // the freeze rule kicks in (PR2).
  const archivePages: MetadataRoute.Sitemap = getDailyArchive().map((d) => ({
    url: `${SITE_URL}/archive/${d.date}`,
    lastModified: `${d.date}T00:00:00+09:00`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // /archive/[YYYY-MM] — every month in the corpus. Lower priority than
  // per-day pages since they're aggregation views.
  const archiveMonthPages: MetadataRoute.Sitemap = getMonthlyArchive().map((m) => ({
    url: `${SITE_URL}/archive/${m.yearMonth}`,
    lastModified: `${m.yearMonth}-01T00:00:00+09:00`,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [
    ...staticPages,
    ...companyPages,
    ...versusPages,
    ...archivePages,
    ...archiveMonthPages,
  ];
}
