export interface NewsItem {
  headline: string;
  summary: string;
  /** Publisher name (e.g. "한국경제"). For old items may be a portal domain
   * like "v.daum.net" — backfill_news.py upgrades these where possible. */
  source: string;
  /** RSS link. For Google News this is a redirect URL. Use `final_url` when present. */
  url: string;
  /**
   * Decoded publisher URL when crawler successfully unwrapped a Google News
   * redirect. UI should prefer `final_url || url`. Optional because items
   * from Naver feed (or pre-unwrap items) won't have it.
   */
  final_url?: string;
  published_at: string;
  /** Taxonomy tags from infer_tags(): 정책 / 기업 / 사고 / 서비스 / 해외 / 일반 */
  tags: string[];
  /**
   * Canonical company names matched in the headline by infer_companies().
   * Optional — only populated when the matcher found at least one company
   * in companies.json. UI uses this for the "이 기업 관련 뉴스" filter and
   * for the company detail page's RelatedNews section.
   */
  companies?: string[];
}

/** Public API response from /api/news.json (paginated). */
export interface NewsListResponse {
  items: NewsItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Computed weekly insight aggregate (Phase 3 cherry-pick #7). */
export interface WeeklyInsight {
  /** ISO week boundaries: [start, end] inclusive. */
  range: [string, string];
  total_articles: number;
  /** Top 3 companies by mention count in `companies` field over the window. */
  top_companies: Array<{ name: string; count: number }>;
  /** First headline tagged 정책 or 사고 in the window, if any. */
  highlight_headline: string | null;
  /** Daily article counts for sparkline, length 7. */
  daily_counts: number[];
}

export interface Company {
  id: number;
  name: string;
  status: string;
  zones: string[];
  vehicle_model: string;
  partner: string;
  commercialize_date: string | null;
  level: number;
  founded_year?: number | null;
  total_funding_krw?: number | null;
  fleet_size?: number | null;
  website?: string | null;
  key_milestone?: string | null;
  notes: string;
  updated_at: string;
}

export interface Zone {
  id: number;
  name: string;
  region: string;
  lat: number;
  lng: number;
  area_km2: number;
  status: string;
  companies: string[];
  description: string;
  designated?: string;
  boundary: [number, number][];
}

export interface TimelineEvent {
  id: number;
  date: string;
  title: string;
  description: string;
  tag: string;
  is_future: boolean;
}
