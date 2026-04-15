import type { MetadataRoute } from "next";
import companiesData from "@data/companies.json";

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

  return [...staticPages, ...companyPages];
}
