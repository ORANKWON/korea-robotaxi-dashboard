import type { Company, NewsItem, Zone } from "@/types";
import companiesData from "@data/companies.json";
import newsData from "@data/news.json";
import zonesData from "@data/zones.json";

const companies = companiesData as Company[];
const news = (newsData as NewsItem[]).slice(0, 10);
const zones = zonesData as Zone[];

const statusColor: Record<string, string> = {
  "시범운행": "bg-green-100 text-green-800",
  "운행 중": "bg-green-100 text-green-800",
  "개발 중": "bg-yellow-100 text-yellow-800",
  "준비 중": "bg-yellow-100 text-yellow-800",
};

const tagColor: Record<string, string> = {
  "정책": "bg-blue-100 text-blue-700",
  "기업": "bg-purple-100 text-purple-700",
  "서비스": "bg-green-100 text-green-700",
  "사고": "bg-red-100 text-red-700",
  "해외": "bg-orange-100 text-orange-700",
  "일반": "bg-gray-100 text-gray-700",
};

export default function Home() {
  const activeCompanies = companies.filter((c) => c.status === "시범운행").length;
  const activeZones = zones.filter((z) => z.status === "운행 중").length;
  const totalArea = zones.reduce((sum, z) => sum + z.area_km2, 0);

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="운행 기업" value={`${activeCompanies}개`} sub={`전체 ${companies.length}개`} />
        <KpiCard label="운행 구역" value={`${activeZones}개`} sub={`전체 ${zones.length}개`} />
        <KpiCard label="총 면적" value={`${totalArea.toFixed(1)}km²`} sub="시범운행 지구" />
        <KpiCard label="SAE 최고 레벨" value={`Level ${Math.max(...companies.map((c) => c.level))}`} sub="국내 기준" />
      </div>

      {/* Companies */}
      <section>
        <h2 className="text-xl font-bold mb-4">기업 현황</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {companies.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{c.name}</h3>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColor[c.status] || "bg-gray-100 text-gray-700"}`}>
                  {c.status}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="font-medium">차량:</span> {c.vehicle_model}</p>
                <p><span className="font-medium">파트너:</span> {c.partner}</p>
                <p><span className="font-medium">구역:</span> {c.zones.join(", ") || "미정"}</p>
                <p><span className="font-medium">SAE Level:</span> {c.level}</p>
              </div>
              <p className="mt-3 text-sm text-gray-500">{c.notes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* News Feed */}
      <section>
        <h2 className="text-xl font-bold mb-4">최근 뉴스</h2>
        <div className="space-y-3">
          {news.map((n, i) => (
            <a
              key={i}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:border-blue-300 hover:shadow transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-sm leading-snug line-clamp-2">{n.headline}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {n.source} · {new Date(n.published_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {n.tags.map((tag) => (
                    <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${tagColor[tag] || tagColor["일반"]}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
