import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "글로벌 비교 — 한국 vs 미국·중국 로보택시",
  description:
    "한국 로보택시 산업의 글로벌 현황 비교. Waymo, Pony.ai, Baidu 대비 SWM, 42dot, 모셔널의 차량 규모·상용화·규제 준비도 비교. 주요 마일스톤 타임라인과 시장 포지션을 한눈에.",
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "글로벌 로보택시 비교 — 한국 vs 미국·중국",
    description: "Waymo, Pony.ai 대비 한국 자율주행 기업의 글로벌 포지션 비교.",
    url: "/compare",
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
