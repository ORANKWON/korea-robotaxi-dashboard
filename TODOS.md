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

---

## TODO-009: 주간 뉴스레터 (Resend + 구독자 DB)
**What:** 매주 월요일 오전, 지난 7일 주요 뉴스/규제 변화/기업 동향 요약을 이메일로 발송.
**Why:** 1순위 사용자(업계 관계자)는 능동 전달을 선호. RSS 구독자 데이터로 PMF 검증 후 진행.
**Pros:** 재방문 동기 강화, 이메일 구독자 = 명확한 PMF 신호
**Cons:** 운영 부담 (매주 큐레이션 필요), 백엔드 (Resend + 구독자 저장소) 필요
**Depends on:** Bundle 1 RSS 구독자 50+ 도달 후 검증
**Added by:** /plan-ceo-review 2026-04-16

---

## TODO-010: 규제 트래커 페이지
**What:** 자율주행 관련 법안/시범운행지구 지정/임시운행허가 등 규제 변화를 시간순 트래킹.
**Why:** 1순위 사용자는 규제 변화 = 직접 사업 영향. 차별화 강력 포인트.
**Pros:** 강력한 재방문 동기, 다른 곳에 없는 데이터
**Cons:** 큐레이션 부담 영구적, 자동 크롤링 한계 (관보/국회 의안 RSS 없음)
**Depends on:** 큐레이션 ROI 검증 (수동 실험 1개월 후 결정)
**Added by:** /plan-ceo-review 2026-04-16

---

## TODO-011: PWA + Push 알림
**What:** 설치 가능한 PWA로 전환, 주요 뉴스/규제 변화 시 push notification.
**Why:** 모바일 우선 사용자 워크플로 강화.
**Pros:** 앱처럼 동작, 알림으로 재방문
**Cons:** VAPID 키 + push 백엔드 필요, iOS Safari push 제약
**Depends on:** Plausible로 모바일 사용 비율 30%+ 확인
**Added by:** /plan-ceo-review 2026-04-16

---

## TODO-012: 슬랙 봇
**What:** Slack workspace에 추가하면 채널에 새 뉴스 자동 포스팅하는 봇.
**Why:** 업계 관계자 = 슬랙으로 정보 공유. 봇 = 슬랙에 직접 침투.
**Pros:** B2B 채널 확보, 회사 단위 사용 (1:N)
**Cons:** Slack OAuth + app distribution + 호스팅 필요
**Depends on:** RSS 구독자 100+ 후 ROI 평가
**Added by:** /plan-ceo-review 2026-04-16

---

## TODO-013: 회사 시계열 차트
**What:** 기업별 차량 수, 운영 구역, Level 변화를 시계열로 시각화.
**Why:** "언제부터 운영 수준이 올라갔나" — 투자자/PM에게 핵심 가치.
**Pros:** 차별화, 데이터 깊이
**Cons:** TODO-002 (companies.json history) 선행 필요
**Depends on:** TODO-002 + Phase 2 Supabase 스키마
**Added by:** /plan-ceo-review 2026-04-16

---

## TODO-014: i18n (영문)
**What:** 영문 페이지 추가, 글로벌 robotaxi 트래커에서 인용 가능한 데이터 소스 포지셔닝.
**Why:** 한국 데이터를 영문으로 인용하는 글로벌 리서처/언론에 노출.
**Pros:** 글로벌 SEO, 한국 robotaxi 정보의 canonical source 가능성
**Cons:** 번역 유지 부담, 콘텐츠 2배
**Depends on:** Bundle 1 출시 후 글로벌 트래픽 비율 측정
**Added by:** /plan-ceo-review 2026-04-16
