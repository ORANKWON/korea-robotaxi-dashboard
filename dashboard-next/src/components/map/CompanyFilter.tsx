import zonesData from "@data/zones.json";
import type { Zone } from "@/types";
import { COMPANY_COLORS, DEFAULT_COLOR } from "@/lib/map-constants";

const zones = zonesData as Zone[];
const companies = Array.from(new Set(zones.flatMap((z) => z.companies))).sort();

interface CompanyFilterProps {
  activeCompany: string | null;
  onToggle: (company: string | null) => void;
}

export default function CompanyFilter({
  activeCompany,
  onToggle,
}: CompanyFilterProps) {
  return (
    <div className="absolute top-4 right-4 z-10">
      <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 shadow-lg">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 font-medium">
          기업 필터
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onToggle(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              activeCompany === null
                ? "bg-white/15 text-white border border-white/20"
                : "text-zinc-400 border border-white/5 hover:border-white/15"
            }`}
          >
            전체
          </button>
          {companies.map((company) => {
            const color = COMPANY_COLORS[company] || DEFAULT_COLOR;
            const isActive = activeCompany === company;
            return (
              <button
                key={company}
                onClick={() => onToggle(isActive ? null : company)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-white/15 text-white border border-white/20"
                    : "text-zinc-400 border border-white/5 hover:border-white/15"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: color }}
                />
                {company}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
