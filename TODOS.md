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

## TODO-005: 기업 투자/차량 구조화 필드 추가
**What:** companies.json에 `total_funding_krw` (누적 투자액 억원), `fleet_size` (차량 수), `founded_year`, `website`, `key_milestone` 필드 추가
**Why:** 투자자가 가장 먼저 보는 숫자가 notes 텍스트에 묻혀 있음. 구조화하면 기업 카드에 바로 표시 가능
**Pros:** 투자 메모 수준의 기업 카드. validate_data.py 검증 추가 가능
**Cons:** 7개 기업 데이터 수동 수집 필요
**Context:** robotaxitracker.com 참고. 그쪽은 차량 개별 추적까지 하지만 우리는 기업 단위 구조화가 적합. 라이드플럭스 "누적 투자 752억원"이 notes에만 있는 상태.
**Depends on:** 없음
**Added by:** /plan-ceo-review 2026-04-02

---

## TODO-006: 기업 상세 페이지 (/company/[id])
**What:** 기업 카드 클릭 → 상세 페이지. 투자 이력, 해당 기업 타임라인 이벤트, 관련 뉴스, 운행 구역 지도
**Why:** 현재 기업 카드 클릭해도 아무 일도 안 일어남. 투자자가 특정 기업을 깊게 보는 플로우가 없음
**Pros:** 투자자 UX 대폭 개선. Next.js dynamic route로 간단 구현
**Cons:** TODO-005 (구조화 필드) 선행 필요
**Context:** robotaxitracker.com은 차량별 상세 페이지가 있음. 우리는 기업별 상세 페이지가 자연스러움.
**Depends on:** TODO-005
**Added by:** /plan-ceo-review 2026-04-02

---

## ~~TODO-007: 글로벌 비교 페이지 팩트체크~~ ✅ 완료
**Resolved:** 2026-04-10 — Waymo 3,000대, Pony.ai 1,446대, Baidu 1,000대+ 반영. 마일스톤 2025-2026 추가. 준비도 스코어 소폭 조정.

---

## TODO-008: 뉴스 태그 필터
**What:** 뉴스 목록에 기업/정책/서비스 태그 필터 UI 추가
**Why:** 현재 뉴스가 시간순으로만 나열됨. 투자자가 특정 기업이나 정책 뉴스만 보고 싶을 때 필터 없음
**Pros:** UX 개선. 기존 infer_tags() 함수가 이미 태그를 생성하고 있어 데이터는 준비됨
**Cons:** 프론트엔드 UI 작업 필요
**Context:** robotaxitracker.com은 차량/도시/상태별 필터 제공. 우리는 기업/정책/서비스 카테고리가 적합.
**Depends on:** 없음
**Added by:** /plan-ceo-review 2026-04-02
