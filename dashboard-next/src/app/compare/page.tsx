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
  { name: "Waymo (미국)", vehicles: 3000, color: "#3b82f6" },
  { name: "Pony.ai (중국)", vehicles: 1446, color: "#f97316" },
  { name: "Baidu Apollo (중국)", vehicles: 1000, color: "#ef4444" },
  { name: "SWM·카카오 (한국)", vehicles: 7, color: "#8b5cf6" },
  { name: "오토노머스에이투지 (한국)", vehicles: 62, color: "#10b981" },
];

const readinessData = [
  { subject: "법/규제", 한국: 65, 미국: 90, 중국: 80 },
  { subject: "인프라", 한국: 72, 미국: 92, 중국: 85 },
  { subject: "기술 수준", 한국: 58, 미국: 95, 중국: 88 },
  { subject: "시장 규모", 한국: 40, 미국: 95, 중국: 92 },
  { subject: "보험/책임", 한국: 55, 미국: 75, 중국: 65 },
  { subject: "대중 수용도", 한국: 68, 미국: 62, 중국: 72 },
];

const milestoneData = [
  { country: "미국", year: 2018, event: "Waymo One 피닉스 상용 서비스 시작" },
  { country: "중국", year: 2020, event: "Baidu Apollo 베이징 시범운행 개시" },
  { country: "한국", year: 2020, event: "상암 DMC 시범운행지구 1차 지정 (6곳)" },
  { country: "미국", year: 2023, event: "Cruise SF 무인운행 허가 후 사고로 중단" },
  { country: "중국", year: 2024, event: "우한 전역 무인택시 허가, Apollo 누적 700만 건" },
  { country: "한국", year: 2024, event: "SWM 강남 심야 로보택시 시범운행 개시" },
  { country: "미국", year: 2025, event: "Waymo 주간 50만 건 유료 운행, 2,500대 운영" },
  { country: "중국", year: 2025, event: "Pony.ai 상장(나스닥), 1,000대 돌파" },
  { country: "한국", year: 2025, event: "시범운행지구 42곳 확대, 자율주행 마을버스 시작" },
  { country: "미국", year: 2026, event: "Waymo 3,000대, 6세대 완전무인 운행 개시" },
  { country: "중국", year: 2026, event: "Pony.ai 3,000대·20개 도시 목표, 한국 진출" },
  { country: "한국", year: 2026, event: "강남 로보택시 유료 전환 (4.6), 모셔널 무인운행 예정" },
];

export default function ComparePage() {
  return (
    <div className="space-y-10">
      <h1 className="text-xl font-bold">글로벌 비교</h1>

      {/* Fleet Size */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">로보택시 차량 규모 (추정)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fleetData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 13 }} width={120} />
              <Tooltip />
              <Bar dataKey="vehicles" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-400 mt-2">* 2026.3 기준 공개 자료 추정치. Waymo 3,000대(6세대 포함), Pony.ai 1,446대(IR 공시), Baidu 1,000대+(글로벌).</p>
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
