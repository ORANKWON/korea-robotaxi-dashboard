# TODOS

## TODO-001: KakaoMap 비즈니스 계정 전환 검토
**What:** Phase 2 공개 배포 전 KakaoMap ToS 및 플랜 확인
**Why:** 공개 URL에서 트래픽이 늘거나 상업적 목적으로 판단되면 무료 개발자 플랜 → 유료 전환 필요. 모르고 넘기면 Phase 2 배포 후 갑자기 지도 렌더링 중단될 수 있음.
**Pros:** 미리 확인하면 Phase 2 배포 차질 없음
**Cons:** 유료 전환 시 월 비용 추가
**Context:** 현재 Phase 1은 개인 개발자 계정(무료)으로 진행. Phase 2 Vercel 배포 + 투자자 공유 URL이 되는 시점에 "상업적 목적" 여부 재검토 필요. KakaoMap 비즈니스 약관: https://apis.map.kakao.com/web/guide/#policy
**Depends on:** Phase 2 배포 시작 전
**Added by:** /plan-eng-review 2026-03-30

---

## TODO-002: companies.json 상태 히스토리 추적
**What:** 기업별 현황 변화를 시계열로 기록 (Level 업그레이드, 구역 확대 등)
**Why:** 투자자 타겟 대시보드에서 "언제부터 운영 수준이 올라갔나"를 보여주는 시계열 데이터가 핵심 가치. 현재 구조는 현재 상태만 저장하고 과거 기록이 없음.
**Pros:** 시계열 시각화 추가 가능, 대시보드 차별화 포인트
**Cons:** companies.json 구조 변경 필요, Phase 1 → Phase 2 마이그레이션 시 history 데이터 없음
**Context:** Phase 1에서는 companies.json에 `updated_at` 필드만 추가하고, Phase 2 Supabase 설계 시 `companies_history` audit 테이블 추가 검토. 구현 시작점: companies 테이블에 `AFTER UPDATE` 트리거로 변경 이력 자동 기록.
**Depends on:** Phase 2 Supabase 스키마 설계
**Added by:** /plan-eng-review 2026-03-30

---

## TODO-003: Naver API 키워드 정밀도 모니터링 및 개선
**What:** 첫 1주 크롤링 실행 후 검색 결과 노이즈 비율 확인, 필요 시 키워드 다중화
**Why:** '자율주행택시' 단일 키워드로 ADAS/일반 자율주행 관련 노이즈가 혼입될 수 있음. 뉴스가 적은 날 0건 리턴 가능. AI 요약 품질이 입력 데이터 정확도에 직접 의존.
**Pros:** 요약 품질 향상, 투자자에게 보여줄 수 있는 신뢰도
**Cons:** 키워드 추가 시 일일 API 호출 증가 (현재 1만 건 여유 충분)
**Context:** 1주 실행 후 logs에서 리턴된 헤드라인 수동 검토. 노이즈 매칭 시 추가 쿼리 키워드: '로보택시', '자율주행버스', '카카오모빌리티 자율', '42dot', 'SWM 자율'. 또는 네이버 뉴스 결과를 '보도자료'/'기업' 출처로 필터링.
**Depends on:** Phase 1 robotaxi_crawler.py 첫 실행
**Added by:** /plan-eng-review 2026-03-30

---

## TODO-004: 오토노머스에이투지 zones "다수" → 구체적 구역명으로 교체
**What:** `data/companies.json` id:5 오토노머스에이투지의 `"zones": ["다수"]`를 실제 운행 구역명으로 교체
**Why:** 투자자 대시보드에서 "다수"는 정보가 아님. 구체적 구역이 있어야 지도 연동 및 정확한 현황 파악 가능
**Pros:** 데이터 정확성 향상, 지도 연동 가능
**Cons:** 웹 검색으로 최신 운행 구역 확인 필요 (변동 가능)
**Context:** 오토노머스에이투지는 국내 최다 62대 운영 경험. 판교, 세종, 대구 등에서 운행한 이력이 있으나 현재 활성 구역 확인 필요. 웹 검색 후 확정.
**Depends on:** 없음 (독립적으로 수행 가능)
**Added by:** /plan-eng-review 2026-04-01

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

## TODO-007: 글로벌 비교 페이지 팩트체크
**What:** compare 페이지 하드코딩 데이터 최신화. Waymo 차량 수, 준비도 스코어, 마일스톤 등
**Why:** 현재 데이터가 2024년 기준으로 낡았음 (Waymo 700대 → 실제 훨씬 많음). 투자자에게 잘못된 비교 제공 중
**Pros:** 15분이면 수정 가능. 데이터 신뢰도 향상
**Cons:** 정기적 업데이트 메커니즘 없음 (수동)
**Context:** robotaxitracker.com 데이터 참고 가능. Tesla Austin 런치, Waymo 20M+ trips 등 반영 필요
**Depends on:** 없음
**Added by:** /plan-ceo-review 2026-04-02

---

## TODO-008: 뉴스 태그 필터
**What:** 뉴스 목록에 기업/정책/서비스 태그 필터 UI 추가
**Why:** 현재 뉴스가 시간순으로만 나열됨. 투자자가 특정 기업이나 정책 뉴스만 보고 싶을 때 필터 없음
**Pros:** UX 개선. 기존 infer_tags() 함수가 이미 태그를 생성하고 있어 데이터는 준비됨
**Cons:** 프론트엔드 UI 작업 필요
**Context:** robotaxitracker.com은 차량/도시/상태별 필터 제공. 우리는 기업/정책/서비스 카테고리가 적합.
**Depends on:** 없음
**Added by:** /plan-ceo-review 2026-04-02
