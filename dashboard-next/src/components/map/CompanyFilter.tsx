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
    <div className="absolute top-4 right-4 z-10 max-w-[calc(100vw-2rem)]">
      <div className="bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl px-3 py-2 shadow-lg">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
          기업 필터
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onToggle(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              activeCompany === null
                ? "bg-blue-600 text-white border border-blue-600"
                : "text-gray-600 border border-gray-200 hover:border-blue-300 hover:bg-blue-50"
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
                    ? "bg-gray-900 text-white border border-gray-900"
                    : "text-gray-600 border border-gray-200 hover:border-blue-300 hover:bg-blue-50"
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
