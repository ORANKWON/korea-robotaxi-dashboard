"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

const fleetData = [
  { name: "Waymo (미국)", vehicles: 3067, color: "#3b82f6" },
  { name: "Pony.ai (중국)", vehicles: 1446, color: "#f97316" },
  { name: "Baidu Apollo Go (중국)", vehicles: 1000, color: "#ef4444" },
  { name: "Tesla Robotaxi (미국)", vehicles: 578, color: "#6366f1" },
  { name: "WeRide (중국)", vehicles: 500, color: "#eab308" },
  { name: "오토노머스에이투지 (한국)", vehicles: 62, color: "#10b981" },
  { name: "Zoox (미국)", vehicles: 11, color: "#06b6d4" },
  { name: "SWM·카카오 (한국)", vehicles: 7, color: "#8b5cf6" },
];

// Live cities (commercial or pilot) — robotaxitracker.com + public disclosures, 2026.4
const citiesData = [
  { name: "Waymo", cities: 11, planned: 19, fill: "#3b82f6" },
  { name: "Baidu Apollo Go", cities: 10, planned: 5, fill: "#ef4444" },
  { name: "Pony.ai", cities: 5, planned: 15, fill: "#f97316" },
  { name: "WeRide", cities: 7, planned: 8, fill: "#eab308" },
  { name: "Tesla", cities: 2, planned: 7, fill: "#6366f1" },
  { name: "Zoox", cities: 2, planned: 3, fill: "#06b6d4" },
];

const readinessData = [
  { subject: "법/규제", 한국: 65, 미국: 92, 중국: 82 },
  { subject: "인프라", 한국: 72, 미국: 93, 중국: 87 },
  { subject: "기술 수준", 한국: 58, 미국: 96, 중국: 90 },
  { subject: "시장 규모", 한국: 40, 미국: 96, 중국: 94 },
  { subject: "보험/책임", 한국: 55, 미국: 78, 중국: 68 },
  { subject: "대중 수용도", 한국: 68, 미국: 68, 중국: 74 },
];

// Global trip volume proxy — Waymo CPUC Q4 2025 disclosure
const tripGrowthData = [
  { quarter: "2024 Q4", trips: 1.2 },
  { quarter: "2025 Q1", trips: 1.6 },
  { quarter: "2025 Q2", trips: 2.1 },
  { quarter: "2025 Q3", trips: 2.6 },
  { quarter: "2025 Q4", trips: 3.7 },
];

const milestoneData = [
  { country: "미국", year: 2018, event: "Waymo One 피닉스 상용 서비스 시작" },
  { country: "중국", year: 2020, event: "Baidu Apollo 베이징 시범운행 개시" },
  { country: "한국", year: 2020, event: "상암 DMC 시범운행지구 1차 지정 (6곳)" },
  { country: "미국", year: 2023, event: "Cruise SF 무인운행 허가 후 사고로 중단" },
  { country: "중국", year: 2024, event: "우한 전역 무인택시 허가, Apollo 누적 700만 건" },
  { country: "한국", year: 2024, event: "SWM 강남 심야 로보택시 시범운행 개시" },
  { country: "미국", year: 2025, event: "Waymo LA·애틀랜타 오픈, Tesla Austin 로보택시 파일럿 개시" },
  { country: "중국", year: 2025, event: "Pony.ai 상장(나스닥), 1,000대 돌파" },
  { country: "한국", year: 2025, event: "시범운행지구 42곳 확대, 자율주행 마을버스 시작" },
  { country: "미국", year: 2025, event: "Waymo 공식 3,067대 공시 (12월), CPUC Q4 3.7M 운행 +40% QoQ" },
  { country: "미국", year: 2026, event: "Waymo 댈러스·휴스턴·마이애미·올랜도 2월 동시 오픈 (11개 도시)" },
  { country: "미국", year: 2026, event: "Tesla 로보택시 7개 도시 확대 계획 (라스베가스·피닉스·댈러스 등)" },
  { country: "중국", year: 2026, event: "Pony.ai 3,000대·20개 도시 목표, 한국 진출" },
  { country: "한국", year: 2026, event: "강남 로보택시 유료 전환 (4.6), 모셔널 무인운행 예정" },
  { country: "미국", year: 2026, event: "Waymo 도쿄·런던 진출 발표 (Up Next)" },
];

export default function ComparePage() {
  return (
    <div className="space-y-10">
      <h1 className="text-xl font-bold">글로벌 비교</h1>

      {/* Fleet Size */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">로보택시 차량 규모 (글로벌)</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fleetData} layout="vertical" margin={{ left: 140 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
              <Tooltip />
              <Bar dataKey="vehicles" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          * 2026.4 기준. Waymo 3,067대(2025.12.11 공식 공시), Tesla 578대(Bay Area 484 + Austin 94, 감독 포함),
          Pony.ai 1,446대(IR), Zoox 11대(Bay Area/Las Vegas 초대제). 출처:{" "}
          <a href="https://robotaxitracker.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">robotaxitracker.com</a>, 각 사 공시.
        </p>
      </section>

      {/* Live Cities */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">운영 도시 수 (현재 · 예정)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={citiesData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="cities" name="운영 중" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="planned" name="예정" stackId="a" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          * Waymo 11개(피닉스·SF·LA·오스틴·애틀랜타·댈러스·휴스턴·샌안토니오·마이애미·올랜도·내슈빌) + 예정 19개(도쿄·런던 등).
          Tesla 2개(SF·오스틴) + 2026 상반기 7개 예정. 한국은 시범운행지구 42곳 지정, 유료 상용 1곳(강남).
        </p>
      </section>

      {/* Waymo Trip Growth */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">Waymo 분기별 유료 운행 (CPUC 공시)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tripGrowthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: "백만 건", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}M 건`} />
              <Bar dataKey="trips" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          * California Public Utilities Commission 분기별 공시. 2025 Q4: 370만 건, QoQ +40.1%.
          사고율 7.1/10만 건, 민원 13/10만 건. Waymo는 단일 로보택시 사업자 중 유일하게 의무 공시 대상.
        </p>
      </section>

      {/* Readiness Radar */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">자율주행 준비도 비교</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={readinessData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="한국" dataKey="한국" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
              <Radar name="미국" dataKey="미국" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              <Radar name="중국" dataKey="중국" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Global Milestones */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">주요 글로벌 마일스톤</h2>
        <div className="space-y-3">
          {milestoneData.map((m, i) => {
            const countryColor: Record<string, string> = {
              "미국": "bg-blue-100 text-blue-700",
              "중국": "bg-red-100 text-red-700",
              "한국": "bg-purple-100 text-purple-700",
            };
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-500 w-10">{m.year}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${countryColor[m.country] || "bg-gray-100"}`}>
                  {m.country}
                </span>
                <span className="text-sm">{m.event}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
