# TODOS

## TODO-002: companies.json 상태 히스토리 추적
**What:** 기업별 현황 변화를 시계열로 기록 (Level 업그레이드, 구역 확대 등)
**Why:** 투자자 타겟 대시보드에서 "언제부터 운영 수준이 올라갔나"를 보여주는 시계열 데이터가 핵심 가치. 현재 구조는 현재 상태만 저장하고 과거 기록이 없음.
**Pros:** 시계열 시각화 추가 가능, 대시보드 차별화 포인트
**Cons:** companies.json 구조 변경 필요, Phase 1 → Phase 2 마이그레이션 시 history 데이터 없음
**Context:** Phase 1에서는 companies.json에 `updated_at` 필드만 추가하고, Phase 2 Supabase 설계 시 `companies_history` audit 테이블 추가 검토.
**Depends on:** Phase 2 Supabase 스키마 설계
**Added by:** /plan-eng-review 2026-03-30

---

## ~~TODO-005: 기업 투자/차량 구조화 필드 추가~~ ✅ 완료
**Resolved:** 2026-04-10 — founded_year, total_funding_krw, fleet_size, website, key_milestone 추가. 기업 카드 UI에 투자/차량/설립 배지 표시.

---

## ~~TODO-006: 기업 상세 페이지 (/company/[id])~~ ✅ 완료
**Resolved:** 2026-04-10 — /company/[id] 동적 라우트 생성. 기업 정보 헤더(투자/차량/설립/Level), 핵심 마일스톤, 운행 구역 상세, 관련 타임라인, 관련 뉴스 표시. 홈페이지 기업 카드 클릭 시 상세 페이지로 이동.

---

## ~~TODO-007: 글로벌 비교 페이지 팩트체크~~ ✅ 완료
**Resolved:** 2026-04-10 — Waymo 3,000대, Pony.ai 1,446대, Baidu 1,000대+ 반영. 마일스톤 2025-2026 추가. 준비도 스코어 소폭 조정.

---

## ~~TODO-008: 뉴스 태그 필터~~ ✅ 완료
**Resolved:** 2026-04-10 — NewsFeed 클라이언트 컴포넌트 분리. 전체/정책/기업/서비스/사고/해외/일반 필터 버튼 추가. 뉴스 30개로 확대.
