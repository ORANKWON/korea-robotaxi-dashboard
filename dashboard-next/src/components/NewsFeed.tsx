"use client";

import { useState } from "react";
import type { NewsItem } from "@/types";

const tagColor: Record<string, string> = {
  "정책": "bg-blue-100 text-blue-700",
  "기업": "bg-purple-100 text-purple-700",
  "서비스": "bg-green-100 text-green-700",
  "사고": "bg-red-100 text-red-700",
  "해외": "bg-orange-100 text-orange-700",
  "일반": "bg-gray-100 text-gray-700",
};

const ALL_TAGS = ["전체", "정책", "기업", "서비스", "사고", "해외", "일반"];
const DISPLAY_LIMIT = 30;

export default function NewsFeed({ news }: { news: NewsItem[] }) {
  const [activeTag, setActiveTag] = useState("전체");

  const filtered = (activeTag === "전체"
    ? news
    : news.filter((n) => n.tags.includes(activeTag))
  ).slice(0, DISPLAY_LIMIT);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">최근 뉴스</h2>
        <div className="flex gap-1.5">
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`text-xs px-2.5 py-1 rounded-full transition-all ${
                activeTag === tag
                  ? (tagColor[tag] || "bg-gray-800 text-white") + " ring-1 ring-offset-1 ring-gray-300"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">해당 태그의 뉴스가 없습니다.</p>
        )}
        {filtered.map((n, i) => (
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
  );
}
