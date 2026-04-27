/**
 * SSR-safe localStorage hook for /news bookmarks + read state.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 4 +
 * Edge Cases: "동시 두 탭 북마크 토글 → storage 이벤트 리스너로 동기화").
 *
 * Why a custom hook (not `usehooks-ts` etc): we need three behaviors that
 * most off-the-shelf hooks miss:
 *   1. Returns the initial fallback during SSR + first paint, then hydrates
 *      from localStorage on mount (avoids flash + hydration mismatch)
 *   2. Cross-tab sync via the `storage` event so bookmarks made in tab A
 *      show up in tab B without a reload
 *   3. JSON serialization with a try/catch so a corrupted entry doesn't
 *      crash the page — just falls back to the initial value
 *
 * Returns a 3-tuple: [value, setValue, hydrated].
 *   - hydrated=false during SSR + first client paint → use it to skip
 *     rendering bookmark icons until we know the real state
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  // Refs to avoid stale-closure bugs in event handlers
  const keyRef = useRef(key);
  keyRef.current = key;

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // Corrupted value or quota issues — keep initial. Don't surface to user.
    }
    setHydrated(true);
  }, [key]);

  // Cross-tab sync: when storage changes in another tab, mirror it here
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== keyRef.current || e.newValue === null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        // Ignore malformed cross-tab payloads
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(keyRef.current, JSON.stringify(resolved));
        } catch {
          // Quota exceeded or private mode — state still updates in memory
        }
        return resolved;
      });
    },
    [],
  );

  return [value, set, hydrated];
}

/**
 * Specialized helper for Set<string> stored as a JSON array.
 * Returns [set, toggle, has, hydrated].
 */
export function useLocalStorageSet(
  key: string,
): [Set<string>, (member: string) => void, (member: string) => boolean, boolean] {
  const [arr, setArr, hydrated] = useLocalStorage<string[]>(key, []);
  // Memoize the Set so `has` (below) keeps a stable identity per snapshot.
  // Without this, `has` would change every render and break consumers that
  // pass it to `useMemo` / `useEffect` deps.
  const set = useMemo(() => new Set(arr), [arr]);

  const toggle = useCallback(
    (member: string) => {
      setArr((prev) => {
        const s = new Set(prev);
        if (s.has(member)) s.delete(member);
        else s.add(member);
        return Array.from(s);
      });
    },
    [setArr],
  );

  const has = useCallback((member: string) => set.has(member), [set]);

  return [set, toggle, has, hydrated];
}
