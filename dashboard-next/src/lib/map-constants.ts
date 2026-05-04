export const COMPANY_COLORS: Record<string, string> = {
  SWM: "#3b82f6",
  "카카오모빌리티": "#facc15",
  "42dot": "#06b6d4",
  "폴라리스오피스": "#f97316",
  "라이드플럭스": "#8b5cf6",
  "오토노머스에이투지": "#10b981",
  SUM: "#f472b6",
  Pony: "#ef4444",
  "쏘카": "#a855f7",
};
export const DEFAULT_COLOR = "#9ca3af";

export const REGIONS = {
  all: { label: "전체", center: [36.5, 127.5] as [number, number], zoom: 7 },
  capital: { label: "수도권", center: [37.5, 126.95] as [number, number], zoom: 10 },
  seoul: { label: "서울", center: [37.54, 126.97] as [number, number], zoom: 12 },
  sejong: { label: "세종", center: [36.50, 126.95] as [number, number], zoom: 12 },
  daejeon: { label: "대전", center: [36.36, 127.36] as [number, number], zoom: 13 },
  daegu: { label: "대구", center: [35.86, 128.57] as [number, number], zoom: 12 },
  busan: { label: "부산", center: [35.20, 129.21] as [number, number], zoom: 13 },
  // Added 2026-04-29: 광주 전역 자율주행 실증도시 (id=30) — 광주광역시 전체를
  // 커버하는 새 zone. 평동산단(id=20)에 줌 in 하면 전역 zone이 안 보이므로
  // 별도 region 탭이 필요.
  gwangju: { label: "광주", center: [35.16, 126.85] as [number, number], zoom: 11 },
  jeju: { label: "제주", center: [33.45, 126.57] as [number, number], zoom: 11 },
} as const;

export type RegionKey = keyof typeof REGIONS;

// Switched to CARTO Light (Voyager) 2026-04-29 — was dark_all. The dark theme
// made /map the only dark page in an otherwise light dashboard, breaking
// theme consistency with /, /news, /compare, /timeline. Voyager keeps labels
// readable + place names visible without the eye-strain of pure dark mode.
export const LIGHT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
// Phase 5 (zone-polygons-v1) — added vuski/admdongkor attribution alongside
// CARTO + OSM since several zones now derive their boundary from union of
// 행정동 polygons in that dataset. Renders into Leaflet's bottom-right
// attribution control, the standard place readers expect data sourcing.
export const LIGHT_TILE_ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> &copy; ' +
  '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
  ' | 경계: <a href="https://github.com/vuski/admdongkor">vuski/admdongkor</a> 행정동';
