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
