import { useEffect } from "react";
import type { Zone } from "@/types";
import { COMPANY_COLORS, DEFAULT_COLOR } from "@/lib/map-constants";

interface ZoneDetailPanelProps {
  zone: Zone | null;
  onClose: () => void;
}

export default function ZoneDetailPanel({
  zone,
  onClose,
}: ZoneDetailPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className={`absolute top-0 left-0 h-full z-20 transition-transform duration-300 ease-out ${
        zone ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="w-80 h-full bg-zinc-900/90 backdrop-blur-md border-r border-white/10 shadow-2xl overflow-y-auto">
        {zone && (
          <div className="p-5">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10"
            >
              ✕
            </button>

            {/* Status badge */}
            <div className="mb-3">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  zone.status === "운행 중"
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                }`}
              >
                {zone.status}
              </span>
            </div>

            {/* Zone name */}
            <h2 className="text-white font-bold text-lg leading-tight">
              {zone.name}
            </h2>
            <p className="text-zinc-400 text-sm mt-0.5">{zone.region}</p>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wider">
                  면적
                </div>
                <div className="text-white font-semibold mt-0.5">
                  {zone.area_km2} km²
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wider">
                  기업 수
                </div>
                <div className="text-white font-semibold mt-0.5">
                  {zone.companies.length}개
                </div>
              </div>
            </div>

            {/* Designated date */}
            {zone.designated && (
              <div className="mt-3 bg-white/5 rounded-lg p-3">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wider">
                  지정시기
                </div>
                <div className="text-white font-semibold mt-0.5 text-sm">
                  {zone.designated}
                </div>
              </div>
            )}

            {/* Companies */}
            {zone.companies.length > 0 && (
              <div className="mt-5">
                <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">
                  운행 기업
                </div>
                <div className="space-y-1.5">
                  {zone.companies.map((company) => (
                    <div
                      key={company}
                      className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            COMPANY_COLORS[company] || DEFAULT_COLOR,
                        }}
                      />
                      <span className="text-zinc-200 text-sm">{company}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="mt-5">
              <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">
                설명
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">
                {zone.description}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
