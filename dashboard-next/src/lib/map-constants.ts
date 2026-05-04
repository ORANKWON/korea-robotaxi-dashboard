/**
 * Map zone polygon color by company. Keys MUST match `companies.json[].name`
 * (the canonical full form). Locked-in 2026-05-04 — previously had short
 * forms ("SWM", "라이드플럭스") that drifted from companies.json's full
 * canonical names ("SWM (서울자율차)", "라이드플럭스 (RideFlux)"), causing
 * the /map filter to show duplicate chips when zones used different forms.
 *
 * Add a new company → add an entry here keyed by the EXACT companies.json
 * `name`. validate_data.py enforces zones[].companies[] referential
 * integrity, but COMPANY_COLORS is the only dashboard-side color source so
 * a missing entry just falls back to DEFAULT_COLOR (gray) — visible but
 * non-fatal.
 */
export const COMPANY_COLORS: Record<string, string> = {
  "SWM (서울자율차)": "#3b82f6",
  "카카오모빌리티": "#facc15",
  "42dot (포티투닷)": "#06b6d4",
  "포니링크": "#ef4444",
  "오토노머스에이투지": "#10b981",
  "모셔널 (현대차그룹)": "#f97316",
  "라이드플럭스 (RideFlux)": "#8b5cf6",
  "SUM (에스유엠)": "#f472b6",
  "쏘카 (SOCAR)": "#a855f7",
  "현대자동차": "#1d4ed8",
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
