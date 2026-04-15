import type { Metadata } from "next";
import type { TimelineEvent } from "@/types";
import timelineData from "@data/timeline.json";

export const metadata: Metadata = {
  title: "타임라인 — 한국 자율주행 정책·서비스 연표",
  description:
    "한국 자율주행택시 산업의 주요 이벤트 연대기. 2020년 임시운행 허가부터 2027년 전국 확대까지, 정책·규제·서비스 개시 일정을 시간순으로 확인하세요.",
  alternates: { canonical: "/timeline" },
  openGraph: {
    title: "한국 자율주행 타임라인",
    description: "2020~2027 한국 로보택시 정책·서비스 주요 이벤트 연표.",
    url: "/timeline",
  },
};

const events = (timelineData as TimelineEvent[]).sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
);

const tagStyle: Record<string, string> = {
  "정책": "border-blue-500 bg-blue-50",
  "서비스": "border-green-500 bg-green-50",
};

export default function TimelinePage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-6">규제 · 정책 타임라인</h1>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-6">
          {events.map((ev) => (
            <div key={ev.id} className="relative pl-12">
              {/* Dot */}
              <div
                className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                  ev.is_future ? "bg-white border-gray-400" : "bg-blue-600 border-blue-600"
                }`}
              />
              <div
                className={`bg-white rounded-lg border-l-4 p-4 shadow-sm ${
                  tagStyle[ev.tag] || "border-gray-300 bg-white"
                } ${ev.is_future ? "opacity-70" : ""}`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <time className="text-sm font-mono text-gray-500">
                    {new Date(ev.date).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                    })}
                  </time>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {ev.tag}
                  </span>
                  {ev.is_future && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      예정
                    </span>
                  )}
                </div>
                <h3 className="font-semibold">{ev.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{ev.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
