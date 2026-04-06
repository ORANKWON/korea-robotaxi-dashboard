export const COMPANY_COLORS: Record<string, string> = {
  SWM: "#3b82f6",
  "카카오모빌리티": "#facc15",
  "42dot": "#06b6d4",
  "폴라리스오피스": "#f97316",
  "라이드플럭스": "#8b5cf6",
  Pony: "#ef4444",
};
export const DEFAULT_COLOR = "#9ca3af";

export const REGIONS = {
  all: { label: "전체", center: [36.5, 127.5] as [number, number], zoom: 7 },
  capital: { label: "수도권", center: [37.45, 127.0] as [number, number], zoom: 11 },
  sejong: { label: "세종", center: [36.48, 127.0] as [number, number], zoom: 12 },
  jeju: { label: "제주", center: [33.4, 126.57] as [number, number], zoom: 11 },
} as const;

export type RegionKey = keyof typeof REGIONS;

export const DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
export const DARK_TILE_ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
