/**
 * /news loading skeleton — shown during SSR streaming + ISR revalidation.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 4).
 *
 * Mirrors the real layout: header strip + insight widget + filter bar + 5
 * card placeholders. Same heights as the rendered components so the page
 * doesn't jump when content swaps in.
 */
export default function NewsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-2">
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Insight widget */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm h-36 animate-pulse" />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-40 animate-pulse" />

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
