import type { Company, NewsItem, Zone } from "@/types";
import companiesData from "@data/companies.json";
import newsData from "@data/news.json";
import zonesData from "@data/zones.json";
import NewsFeed from "@/components/NewsFeed";
import Link from "next/link";

const companies = companiesData as Company[];
const news = (newsData as NewsItem[])
  .slice()
  .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
  .slice(0, 30);
const zones = zonesData as Zone[];

const statusColor: Record<string, string> = {
  "시범운행": "bg-green-100 text-green-800",
  "운행 중": "bg-green-100 text-green-800",
  "시험운행": "bg-blue-100 text-blue-800",
  "개발 중": "bg-yellow-100 text-yellow-800",
  "준비 중": "bg-yellow-100 text-yellow-800",
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

      {/* News Feed with tag filter */}
      <NewsFeed news={news} />

      {/* Companies */}
      <section>
        <h2 className="text-xl font-bold mb-4">기업 현황</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {companies.map((c) => (
            <Link key={c.id} href={`/company/${c.id}`} className="block bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:border-blue-300 hover:shadow transition-all">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{c.name}</h3>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColor[c.status] || "bg-gray-100 text-gray-700"}`}>
                  {c.status}
                </span>
              </div>
              {/* Key metrics */}
              <div className="flex gap-3 mb-3">
                {c.total_funding_krw != null && (
                  <div className="bg-blue-50 rounded-lg px-3 py-1.5 text-center">
                    <div className="text-xs text-blue-500">투자</div>
                    <div className="text-sm font-bold text-blue-700">
                      {c.total_funding_krw >= 1000 ? `${(c.total_funding_krw / 10000).toFixed(1)}조` : `${c.total_funding_krw}억`}
                    </div>
                  </div>
                )}
                {c.fleet_size != null && (
                  <div className="bg-green-50 rounded-lg px-3 py-1.5 text-center">
                    <div className="text-xs text-green-500">차량</div>
                    <div className="text-sm font-bold text-green-700">{c.fleet_size}대</div>
                  </div>
                )}
                {c.founded_year != null && (
                  <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center">
                    <div className="text-xs text-gray-400">설립</div>
                    <div className="text-sm font-bold text-gray-600">{c.founded_year}</div>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="font-medium">차량모델:</span> {c.vehicle_model}</p>
                <p><span className="font-medium">구역:</span> {c.zones.join(", ") || "미정"}</p>
                {c.key_milestone && (
                  <p><span className="font-medium">마일스톤:</span> {c.key_milestone}</p>
                )}
              </div>
              <p className="mt-3 text-sm text-gray-500 line-clamp-2">{c.notes}</p>
            </Link>
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
