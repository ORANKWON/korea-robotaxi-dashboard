import zonesData from "@data/zones.json";
import type { Zone } from "@/types";

const zones = zonesData as Zone[];
const uniqueCompanies = new Set(zones.flatMap((z) => z.companies));

export default function MapHeader() {
  return (
    <div className="absolute top-4 left-4 z-10">
      <div className="bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl px-4 py-3 shadow-lg">
        <h1 className="text-gray-900 font-bold text-base">한국 로보택시 지도</h1>
        <div className="flex gap-3 mt-1 text-xs text-gray-500">
          <span>{zones.length}개 구역</span>
          <span>{uniqueCompanies.size}개 기업</span>
        </div>
      </div>
    </div>
  );
}
