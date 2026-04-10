export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
  tags: string[];
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
