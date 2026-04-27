"""Calibrate dedup thresholds against the live news.json corpus.

Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan delta #2).

Why this exists:
  bigram Jaccard works well on long English headlines but is risky on short
  Korean headlines (often 30-50 chars → ~30 bigrams). Two unrelated headlines
  about the same topic ("강남 자율주행 유료 전환" vs "강남 자율주행 운행 확대")
  can share most of their bigrams. We need to pick thresholds based on the
  actual score distribution of OUR data, not a guess.

What it does:
  1. Load data/news.json
  2. Compute pairwise bigram Jaccard score for all pairs (sampled if N > 500)
  3. Bucket pairs into:
       - same source + obvious dup heuristic (one is substring of the other)
       - same source non-obvious
       - cross source non-obvious
  4. Recommend thresholds based on the elbow of the score distribution
  5. Write the recommended thresholds + sample fixture pairs to
     tests/fixtures/dedup_thresholds.json

Usage:
  python scripts/calibrate_dedup.py
  python scripts/calibrate_dedup.py --news data/news.json --out tests/fixtures/dedup_thresholds.json

Re-run quarterly (TODO-015) and after every major crawler change.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
from collections import defaultdict
from typing import Iterable

# Allow importing crawler without altering sys.path globally
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from robotaxi_crawler import _bigrams, are_similar_headlines  # noqa: E402

DEFAULT_NEWS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "news.json"
)
DEFAULT_OUT_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "tests", "fixtures", "dedup_thresholds.json",
)
MAX_PAIRS = 50_000  # cap to keep runtime under 10s on 696-row corpus


def jaccard(h1: str, h2: str) -> float:
    b1, b2 = _bigrams(h1), _bigrams(h2)
    if not b1 or not b2:
        return 0.0
    return len(b1 & b2) / len(b1 | b2)


def _normalize(s: str) -> str:
    return re.sub(r"\s+", "", s)


def _is_obvious_dup(h1: str, h2: str) -> bool:
    """Heuristic: one headline is a substring of the other (after whitespace strip),
    or 90%+ of one is contained in the other."""
    a, b = _normalize(h1), _normalize(h2)
    if not a or not b:
        return False
    short, long = sorted([a, b], key=len)
    if short in long:
        return True
    # Check if 90% of short's chars appear consecutively in long
    if len(short) >= 10 and short[:int(len(short) * 0.9)] in long:
        return True
    return False


def calibrate(items: list[dict]) -> dict:
    pairs_same: list[tuple[float, str, str, bool]] = []
    pairs_cross: list[tuple[float, str, str, bool]] = []

    n = len(items)
    print(f"Calibrating against {n} items...")

    # Bound total pairs sampled. For 696 items, full = ~242k pairs. Sample.
    all_indices = [(i, j) for i in range(n) for j in range(i + 1, n)]
    if len(all_indices) > MAX_PAIRS:
        random.seed(42)
        all_indices = random.sample(all_indices, MAX_PAIRS)
        print(f"Sampled {MAX_PAIRS} pairs (full N²={n * (n - 1) // 2})")

    for i, j in all_indices:
        a, b = items[i], items[j]
        h_a, h_b = a.get("headline", ""), b.get("headline", "")
        if not h_a or not h_b:
            continue
        score = jaccard(h_a, h_b)
        obvious = _is_obvious_dup(h_a, h_b)
        record = (score, h_a, h_b, obvious)
        if a.get("source") and a.get("source") == b.get("source"):
            pairs_same.append(record)
        else:
            pairs_cross.append(record)

    same_obvious = [p for p in pairs_same if p[3]]
    cross_obvious = [p for p in pairs_cross if p[3]]

    def percentile(vals: Iterable[float], q: float) -> float:
        s = sorted(vals)
        if not s:
            return 0.0
        idx = max(0, min(len(s) - 1, int(len(s) * q)))
        return s[idx]

    # Recommendation logic:
    #   The "obvious dup" heuristic is conservative — it only catches substring
    #   matches. Semantic duplicates (reordered words, paraphrases) score lower
    #   but are still real dups we want to catch. So the threshold should be
    #   BELOW the p05 of obvious dups (with a safety buffer), but not so low
    #   that random unrelated headlines get caught.
    #
    #   Heuristic: threshold = max(plan_value, p05_obvious - 0.15)
    #   This means: use the plan value unless data shows the obvious-dup p05 is
    #   so high that the plan value would miss it. The 0.15 buffer accounts
    #   for semantic dups that don't share substrings.
    PLAN_SAME, PLAN_CROSS = 0.45, 0.60

    same_obvious_scores = [p[0] for p in same_obvious]
    cross_obvious_scores = [p[0] for p in cross_obvious]

    if same_obvious_scores:
        rec_same = max(PLAN_SAME, percentile(same_obvious_scores, 0.05) - 0.15)
    else:
        rec_same = PLAN_SAME

    if cross_obvious_scores:
        rec_cross = max(PLAN_CROSS, percentile(cross_obvious_scores, 0.05) - 0.15)
    else:
        rec_cross = PLAN_CROSS

    summary = {
        "schema_version": 1,
        "calibrated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "corpus_size": n,
        "pairs_evaluated": len(pairs_same) + len(pairs_cross),
        "same_source_obvious_dups": len(same_obvious),
        "cross_source_obvious_dups": len(cross_obvious),
        "recommended_thresholds": {
            "same_source": round(rec_same, 3),
            "cross_source": round(rec_cross, 3),
        },
        "score_distribution": {
            "same_source_obvious_p05": round(percentile(same_obvious_scores, 0.05), 3),
            "same_source_obvious_p50": round(percentile(same_obvious_scores, 0.5), 3),
            "cross_source_obvious_p05": round(percentile(cross_obvious_scores, 0.05), 3),
            "cross_source_obvious_p50": round(percentile(cross_obvious_scores, 0.5), 3),
        },
        # Golden fixtures consumed by tests/test_crawler_v2.py
        "fixtures": {
            "same_source_dup_pairs": [
                {"a": p[1], "b": p[2], "score": round(p[0], 3)}
                for p in sorted(same_obvious, key=lambda r: -r[0])[:5]
            ],
            "cross_source_dup_pairs": [
                {"a": p[1], "b": p[2], "score": round(p[0], 3)}
                for p in sorted(cross_obvious, key=lambda r: -r[0])[:5]
            ],
            # Borderline non-dups: high score but not obvious — should NOT be dropped
            # at the cross-source threshold. These guard against false positives.
            "cross_source_non_dup_high_score": [
                {"a": p[1], "b": p[2], "score": round(p[0], 3)}
                for p in sorted(
                    [p for p in pairs_cross if not p[3] and p[0] > 0.4],
                    key=lambda r: -r[0],
                )[:5]
            ],
        },
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--news", default=DEFAULT_NEWS_FILE)
    parser.add_argument("--out", default=DEFAULT_OUT_FILE)
    parser.add_argument("--print-only", action="store_true",
                        help="Print summary, don't write golden file")
    args = parser.parse_args()

    if not os.path.exists(args.news):
        print(f"ERROR: {args.news} not found", file=sys.stderr)
        return 1
    with open(args.news, "r", encoding="utf-8") as f:
        items = json.load(f)

    summary = calibrate(items)

    print("\n=== Recommended Thresholds ===")
    print(json.dumps(summary["recommended_thresholds"], indent=2, ensure_ascii=False))
    print("\n=== Score Distribution ===")
    print(json.dumps(summary["score_distribution"], indent=2, ensure_ascii=False))

    if args.print_only:
        return 0

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
