import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자율주행 지도 — 시범운행지구 전체 보기",
  description:
    "한국 자율주행 시범운행지구 29곳을 지도에서 한눈에. 서울 강남·상암·청계천, 세종 BRT, 대구 테크노폴리스, 제주 자율주행지구 등 기업별 운행 구역을 다크 테마 지도로 확인하세요.",
  alternates: { canonical: "/map" },
  openGraph: {
    title: "자율주행 지도 — 한국 로보택시 시범운행지구",
    description: "한국 자율주행 시범운행지구 29곳을 지도에서 한눈에 확인하세요.",
    url: "/map",
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
