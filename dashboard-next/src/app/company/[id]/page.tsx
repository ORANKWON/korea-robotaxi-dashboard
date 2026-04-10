import type { Company, NewsItem, Zone, TimelineEvent } from "@/types";
import companiesData from "@data/companies.json";
import newsData from "@data/news.json";
import zonesData from "@data/zones.json";
import timelineData from "@data/timeline.json";
import Link from "next/link";
import { notFound } from "next/navigation";

const companies = companiesData as Company[];
const allNews = newsData as NewsItem[];
const zones = zonesData as Zone[];
const timeline = timelineData as TimelineEvent[];

const statusColor: Record<string, string> = {
  "시범운행": "bg-green-100 text-green-800",
  "운행 중": "bg-green-100 text-green-800",
  "시험운행": "bg-blue-100 text-blue-800",
  "개발 중": "bg-yellow-100 text-yellow-800",
  "준비 중": "bg-yellow-100 text-yellow-800",
};

export function generateStaticParams() {
  return companies.map((c) => ({ id: String(c.id) }));
}

export function generateMetadata({ params }: { params: { id: string } }) {
  const company = companies.find((c) => c.id === Number(params.id));
  return {
    title: company ? `${company.name} — 한국 로보택시 대시보드` : "기업 상세",
  };
}

export default function CompanyDetail({ params }: { params: { id: string } }) {
  const company = companies.find((c) => c.id === Number(params.id));
  if (!company) notFound();

  // Related zones: zones where this company operates
  const companyZones = zones.filter((z) =>
    z.companies.some((name) => company.name.includes(name) || name.includes(company.name.split(" ")[0]))
    || company.zones.some((cz) => z.name.includes(cz) || cz.includes(z.name))
  );

  // Related timeline events: match by company name keywords
  const nameKeywords = company.name.split(/[\s()（）]+/).filter((w) => w.length >= 2);
  const relatedTimeline = timeline.filter((t) =>
    nameKeywords.some((kw) => t.title.includes(kw) || t.description.includes(kw))
  );

  // Related news: match by company name keywords
  const relatedNews = allNews.filter((n) =>
    nameKeywords.some((kw) => n.headline.includes(kw) || n.summary.includes(kw))
  ).slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">대시보드</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{company.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">
              {company.website ? (
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">
                  {company.name} ↗
                </a>
              ) : company.name}
            </h1>
            <p className="text-gray-500 mt-1">{company.vehicle_model} · {company.partner}</p>
          </div>
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${statusColor[company.status] || "bg-gray-100 text-gray-700"}`}>
            {company.status}
          </span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="SAE Level" value={`Level ${company.level}`} color="gray" />
          {company.total_funding_krw != null && (
            <MetricCard
              label="누적 투자"
              value={company.total_funding_krw >= 10000 ? `${(company.total_funding_krw / 10000).toFixed(1)}조원` : `${company.total_funding_krw}억원`}
              color="blue"
            />
          )}
          {company.fleet_size != null && (
            <MetricCard label="차량 규모" value={`${company.fleet_size}대`} color="green" />
          )}
          {company.founded_year != null && (
            <MetricCard label="설립" value={`${company.founded_year}년`} color="gray" />
          )}
          {company.commercialize_date && (
            <MetricCard label="상용화" value={company.commercialize_date} color="purple" />
          )}
        </div>

        {/* Key milestone */}
        {company.key_milestone && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4">
            <p className="text-sm font-medium text-blue-800">핵심 마일스톤</p>
            <p className="text-sm text-blue-700 mt-0.5">{company.key_milestone}</p>
          </div>
        )}

        {/* Notes */}
        <p className="text-sm text-gray-600 leading-relaxed">{company.notes}</p>

        <p className="text-xs text-gray-400 mt-4">
          최종 업데이트: {new Date(company.updated_at).toLocaleDateString("ko-KR")}
        </p>
      </div>

      {/* Zones */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-4">운행 구역</h2>
        {company.zones.length === 0 && companyZones.length === 0 ? (
          <p className="text-sm text-gray-400">배정된 구역이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {companyZones.length > 0 ? (
              companyZones.map((z) => (
                <div key={z.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium">{z.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[z.status] || "bg-gray-100 text-gray-700"}`}>
                      {z.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{z.region} · {z.area_km2}km²</p>
                  <p className="text-sm text-gray-600 mt-1">{z.description}</p>
                  {z.designated && (
                    <p className="text-xs text-gray-400 mt-1">지정일: {z.designated}</p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">
                <p>운행 구역: {company.zones.join(", ")}</p>
                <p className="text-xs text-gray-400 mt-1">상세 구역 정보가 아직 매핑되지 않았습니다.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Timeline */}
      {relatedTimeline.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-4">주요 이벤트</h2>
          <div className="space-y-3">
            {relatedTimeline.map((t) => (
              <div key={t.id} className="flex gap-4 items-start">
                <div className="text-sm text-gray-400 w-24 shrink-0">
                  {new Date(t.date).toLocaleDateString("ko-KR")}
                </div>
                <div>
                  <h3 className="text-sm font-medium">
                    {t.title}
                    {t.is_future && <span className="ml-2 text-xs text-orange-500 font-normal">(예정)</span>}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related news */}
      {relatedNews.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-4">관련 뉴스</h2>
          <div className="space-y-2">
            {relatedNews.map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-gray-100 p-3 hover:border-blue-300 hover:shadow transition-all"
              >
                <h3 className="text-sm font-medium line-clamp-1">{n.headline}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {n.source} · {new Date(n.published_at).toLocaleDateString("ko-KR")}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
    gray: "bg-gray-50 text-gray-700",
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${colorMap[color] || colorMap.gray}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
