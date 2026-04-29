import type { MetadataRoute } from "next";
import companiesData from "@data/companies.json";
import { getAllCompanyPairs } from "@/lib/companies";

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

  return [...staticPages, ...companyPages, ...versusPages];
}
